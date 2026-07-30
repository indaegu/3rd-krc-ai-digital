# -*- coding: utf-8 -*-
"""제출 서류 마크다운을 인쇄용 HTML로 바꾼다.

pandoc 같은 외부 도구 없이 동작해야 해서 필요한 문법만 직접 처리한다. 대상 문서가
쓰는 것은 제목, 표(정렬 포함), 목록, 체크박스, 인용, 코드펜스, 이미지, 굵게, 인라인
코드, 수평선뿐이다. 그 밖의 문법은 들어오면 그대로 글자로 나온다.

이미지는 base64로 박아 넣는다. Chrome 헤드리스가 file:// 하위 리소스를 막는 경우가
있어 경로 참조보다 안전하고, 결과 HTML 한 개만 옮겨도 그림이 따라간다.

    python scripts/md-to-html.py <입력.md> <출력.html>
"""

import base64
import html
import io
import os
import re
import sys

FONT_PATH = "apps/web/src/app/fonts/PretendardVariable.woff2"


def data_uri(path, mime):
    with open(path, "rb") as handle:
        return "data:%s;base64,%s" % (mime, base64.b64encode(handle.read()).decode())


def inline(text):
    """굵게, 인라인 코드, 이미지, 링크만 변환한다. 나머지는 이스케이프한다."""
    placeholders = []

    def stash(markup):
        placeholders.append(markup)
        return "\x00%d\x00" % (len(placeholders) - 1)

    # 이미지가 링크보다 먼저다(문법이 겹친다).
    def image(match):
        alt, src = match.group(1), match.group(2)
        if not os.path.isabs(src) and os.path.exists(src):
            src = data_uri(src, "image/png")
        return stash('<img alt="%s" src="%s">' % (html.escape(alt), src))

    text = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", image, text)
    text = re.sub(
        r"(?<!!)\[([^\]]+)\]\(([^)]+)\)",
        lambda m: stash(
            '<a href="%s">%s</a>' % (html.escape(m.group(2)), html.escape(m.group(1)))
        ),
        text,
    )
    text = re.sub(
        r"`([^`]+)`",
        lambda m: stash("<code>%s</code>" % html.escape(m.group(1))),
        text,
    )
    # 사람이 채울 빈칸 "(     )" 는 밑줄 칸으로 그린다. HTML은 연속 공백을 한 칸으로
    # 줄여 버려서 그대로 두면 "( )" 로 보이고 채울 자리인지 알 수 없다.
    text = re.sub(
        r"\(\s{3,}\)",
        lambda _m: stash('<span class="blank"></span>'),
        text,
    )
    # 이미 양식에서 넘어온 &nbsp; 는 살린다.
    text = text.replace("&nbsp;", stash("&nbsp;"))
    text = html.escape(text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)

    for index, markup in enumerate(placeholders):
        text = text.replace("\x00%d\x00" % index, markup)
    return text


def alignments(divider):
    result = []
    for cell in [c.strip() for c in divider.strip().strip("|").split("|")]:
        if cell.endswith(":") and cell.startswith(":"):
            result.append("center")
        elif cell.endswith(":"):
            result.append("right")
        else:
            result.append("left")
    return result


def split_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def convert(lines):
    out = []
    index = 0
    total = len(lines)

    while index < total:
        line = lines[index]
        stripped = line.strip()

        if stripped == "":
            index += 1
            continue

        # 코드펜스
        if stripped.startswith("```"):
            index += 1
            block = []
            while index < total and not lines[index].strip().startswith("```"):
                block.append(lines[index])
                index += 1
            index += 1
            out.append("<pre><code>%s</code></pre>" % html.escape("\n".join(block)))
            continue

        # 수평선
        if re.fullmatch(r"-{3,}", stripped):
            out.append('<hr class="page-break">')
            index += 1
            continue

        # 제목
        heading = re.match(r"(#{1,6})\s+(.*)", stripped)
        if heading:
            level = len(heading.group(1))
            out.append("<h%d>%s</h%d>" % (level, inline(heading.group(2)), level))
            index += 1
            continue

        # 표: 헤더 줄 다음이 구분선일 때만
        if (
            stripped.startswith("|")
            and index + 1 < total
            and re.fullmatch(r"\|[\s:\-|]+\|", lines[index + 1].strip())
        ):
            header = split_row(stripped)
            aligns = alignments(lines[index + 1].strip())
            index += 2
            rows = []
            while index < total and lines[index].strip().startswith("|"):
                rows.append(split_row(lines[index].strip()))
                index += 1

            def cells(values, tag):
                parts = []
                for position, value in enumerate(values):
                    align = aligns[position] if position < len(aligns) else "left"
                    parts.append(
                        '<%s style="text-align:%s">%s</%s>'
                        % (tag, align, inline(value), tag)
                    )
                return "".join(parts)

            table = ["<table><thead><tr>%s</tr></thead><tbody>" % cells(header, "th")]
            for row in rows:
                table.append("<tr>%s</tr>" % cells(row, "td"))
            table.append("</tbody></table>")
            out.append("".join(table))
            continue

        # 인용
        if stripped.startswith(">"):
            block = []
            while index < total and lines[index].strip().startswith(">"):
                block.append(re.sub(r"^\s*>\s?", "", lines[index]))
                index += 1
            out.append("<blockquote>%s</blockquote>" % convert(block))
            continue

        # 목록(체크박스 포함). 이어지는 들여쓴 줄은 같은 항목으로 붙인다.
        bullet = re.match(r"([-*])\s+(.*)", stripped)
        number = re.match(r"(\d+)\.\s+(.*)", stripped)
        if bullet or number:
            ordered = number is not None
            items = []
            while index < total:
                current = lines[index]
                # 항목 사이의 빈 줄은 목록을 끊지 않는다. 끊으면 목록이 새로 시작해
                # 번호가 매번 1로 돌아간다(동의서 1~4항이 전부 1로 찍혔다).
                if current.strip() == "":
                    lookahead = index + 1
                    while lookahead < total and lines[lookahead].strip() == "":
                        lookahead += 1
                    if lookahead < total and re.match(
                        r"\s*(?:[-*]|\d+\.)\s+", lines[lookahead]
                    ):
                        index = lookahead
                        continue
                    break
                head = re.match(r"\s*(?:[-*]|\d+\.)\s+(.*)", current)
                if head is None:
                    break
                body = [head.group(1)]
                index += 1
                while (
                    index < total
                    and lines[index].strip() != ""
                    and re.match(r"\s{2,}\S", lines[index])
                    and not re.match(r"\s*(?:[-*]|\d+\.)\s+", lines[index])
                ):
                    body.append(lines[index].strip())
                    index += 1
                text = " ".join(body)
                checkbox = re.match(r"\[([ xX])\]\s*(.*)", text)
                if checkbox:
                    mark = "&#9745;" if checkbox.group(1).lower() == "x" else "&#9744;"
                    items.append(
                        '<li class="task">%s %s</li>' % (mark, inline(checkbox.group(2)))
                    )
                else:
                    items.append("<li>%s</li>" % inline(text))
            tag = "ol" if ordered else "ul"
            out.append("<%s>%s</%s>" % (tag, "".join(items), tag))
            continue

        # 문단: 빈 줄까지 이어 붙인다
        block = []
        while index < total and lines[index].strip() != "":
            nxt = lines[index].strip()
            if nxt.startswith(("#", ">", "|", "```")) or re.fullmatch(r"-{3,}", nxt):
                break
            if re.match(r"\s*(?:[-*]|\d+\.)\s+", lines[index]):
                break
            block.append(nxt)
            index += 1
        if block:
            out.append("<p>%s</p>" % inline(" ".join(block)))
        else:
            index += 1

    return "".join(out)


STYLE = """
@font-face {
  font-family: Pretendard;
  src: url(%(font)s) format('woff2');
  font-weight: 100 900;
}
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Pretendard, 'Malgun Gothic', sans-serif;
  font-size: 10.5pt;
  line-height: 1.65;
  color: #191f28;
}
h1 { font-size: 18pt; margin: 0 0 14px; padding-bottom: 8px; border-bottom: 2px solid #2d83ff; }
h2 { font-size: 13.5pt; margin: 20px 0 8px; color: #0f172a; }
h3 { font-size: 11.5pt; margin: 16px 0 6px; color: #334155; }
p { margin: 6px 0; }
ul, ol { margin: 6px 0; padding-left: 20px; }
li { margin: 3px 0; }
li.task { list-style: none; margin-left: -18px; }
strong { font-weight: 700; }
code {
  padding: 1px 4px; border-radius: 4px;
  background: #f1f5f9; font-family: Consolas, monospace; font-size: 9.5pt;
}
pre {
  padding: 10px 12px; border-radius: 8px; background: #f8fafc;
  border: 1px solid #e2e8f0; overflow: hidden;
}
pre code { padding: 0; background: none; font-size: 9pt; line-height: 1.5; }
blockquote {
  margin: 10px 0; padding: 8px 14px;
  border-left: 3px solid #cbd5e1; background: #f8fafc; color: #475569;
}
blockquote p { margin: 4px 0; }
table {
  width: 100%%; margin: 8px 0; border-collapse: collapse;
  font-size: 9.5pt; page-break-inside: avoid;
}
th, td { padding: 6px 8px; border: 1px solid #dbe2ea; vertical-align: top; }
th { background: #eef4fb; font-weight: 700; }
img { max-width: 100%%; max-height: 330px; display: block; margin: 0 auto; }
hr.page-break { height: 0; margin: 14px 0; border: 0; border-top: 1px solid #e2e8f0; }
a { color: #0064f5; text-decoration: none; word-break: break-all; }
/* 사람이 채울 자리. 인쇄했을 때 손으로 적을 수 있게 밑줄만 남긴다. */
.blank {
  display: inline-block; min-width: 92px; height: 1.15em;
  margin: 0 2px; border-bottom: 1px solid #94a3b8; vertical-align: bottom;
}
"""


def main():
    source, target = sys.argv[1], sys.argv[2]
    # 이미지 상대경로를 풀 수 있도록 문서 폴더로 옮겨 간다.
    root = os.getcwd()
    folder = os.path.dirname(os.path.abspath(source))
    os.chdir(folder)
    text = io.open(os.path.basename(source), encoding="utf-8").read()
    body = convert(text.split("\n"))
    os.chdir(root)

    style = STYLE % {"font": data_uri(FONT_PATH, "font/woff2")}
    page = (
        "<!doctype html><html lang=ko><head><meta charset=utf-8>"
        "<title>%s</title><style>%s</style></head><body>%s</body></html>"
        % (html.escape(os.path.basename(source)), style, body)
    )
    io.open(target, "w", encoding="utf-8").write(page)
    print("%s -> %s (%d bytes)" % (source, target, len(page)))


if __name__ == "__main__":
    main()
