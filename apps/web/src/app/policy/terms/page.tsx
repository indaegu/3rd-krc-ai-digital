// 초안 · 제출 전 사람 검토 필요 — 법적 최종 문안이 아니다(docs/contest-rules.md 근거).
// 서비스 이용약관: 예측은 참고이고 공식 가뭄 예·경보가 우선이라는 면책을 밝힌다.

import { PolicyDoc } from "../PolicyDoc";

export default function TermsPolicyPage() {
  return (
    <PolicyDoc
      title="서비스 이용약관"
      intro="물시계는 농업용수 저수지 사정을 쉽게 보여주는 무료 서비스예요."
      sections={[
        {
          heading: "어떤 서비스인가요",
          paragraphs: [
            "저수지 데이터로 우리 지역 물 사정과 앞으로의 흐름을 쉽게 보여드려요.",
            "가입 없이 바로 쓸 수 있어요.",
          ],
        },
        {
          heading: "예측은 참고예요",
          paragraphs: [
            "앞날 예측은 참고용이에요. 공식 가뭄 예·경보가 우선이에요.",
            "그래서 예측은 “가능성이 있어요” 형태로만 알려드려요.",
          ],
        },
        {
          heading: "공식 정보가 먼저예요",
          paragraphs: [
            "실제 물관리 대응은 한국농어촌공사와 관계 기관의 공식 안내를 먼저 따라 주세요.",
            "물시계의 수치나 설명이 공식 정보와 다르면 공식 정보가 맞아요.",
          ],
        },
        {
          heading: "내용은 바뀔 수 있어요",
          paragraphs: [
            "공공데이터 사정에 따라 화면과 수치가 달라질 수 있어요.",
          ],
        },
      ]}
    />
  );
}
