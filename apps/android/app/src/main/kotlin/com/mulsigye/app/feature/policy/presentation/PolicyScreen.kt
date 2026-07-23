// 초안 · 제출 전 사람 검토 필요 — 법적 최종 문안이 아니다(docs/contest-rules.md 근거).
// 폴리시 3종(위치기반 이용약관·서비스 이용약관·개인정보 처리방침)을 ~해요체로 제공한다.
// 핵심 고지: 주소 원문 미저장·코드만 기기 저장·서버 미전송, 예측 참고·공식 우선 면책,
// 코치(LLM)에는 비식별 값만 전달. 카피는 웹 policy/*와 동일 원칙(공통 SSOT).

package com.mulsigye.app.feature.policy.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mulsigye.app.app.PolicyKind
import com.mulsigye.app.core.designsystem.theme.Bg
import com.mulsigye.app.core.designsystem.theme.Ink
import com.mulsigye.app.core.designsystem.theme.Ink2

private data class PolicySection(val heading: String, val paragraphs: List<String>)

private data class PolicyDoc(
    val title: String,
    val intro: String,
    val sections: List<PolicySection>,
)

private fun docFor(kind: PolicyKind): PolicyDoc = when (kind) {
    PolicyKind.LOCATION -> PolicyDoc(
        title = "위치기반 서비스 이용약관",
        intro = "물시계는 우리 지역 대표 저수지를 찾는 데에만 위치 정보를 써요.",
        sections = listOf(
            PolicySection(
                "무엇에 쓰나요",
                listOf("검색한 주소는 시군구를 확인하고 우리 지역 대표 저수지를 정하는 데에만 써요."),
            ),
            PolicySection(
                "주소는 저장하지 않아요",
                listOf(
                    "대표 저수지를 정한 뒤에는 주소 원문과 검색어를 바로 지워요.",
                    "주소는 이 기기에도, 회사 서버에도 저장하지 않아요.",
                ),
            ),
            PolicySection(
                "기기에만 남는 정보",
                listOf(
                    "고른 지역 코드와 대표 저수지 코드만 이 기기에 저장해요.",
                    "이 코드는 회사 서버로 보내지 않아요.",
                ),
            ),
            PolicySection(
                "언제든 지울 수 있어요",
                listOf("지역 설정에서 지역을 지우면 기기에 남은 코드도 함께 사라져요."),
            ),
        ),
    )

    PolicyKind.TERMS -> PolicyDoc(
        title = "서비스 이용약관",
        intro = "물시계는 농업용수 저수지 사정을 쉽게 보여주는 무료 서비스예요.",
        sections = listOf(
            PolicySection(
                "어떤 서비스인가요",
                listOf(
                    "저수지 데이터로 우리 지역 물 사정과 앞으로의 흐름을 쉽게 보여드려요.",
                    "가입 없이 바로 쓸 수 있어요.",
                ),
            ),
            PolicySection(
                "예측은 참고예요",
                listOf(
                    "앞날 예측은 참고용이에요. 공식 가뭄 예·경보가 우선이에요.",
                    "그래서 예측은 “가능성이 있어요” 형태로만 알려드려요.",
                ),
            ),
            PolicySection(
                "공식 정보가 먼저예요",
                listOf(
                    "실제 물관리 대응은 한국농어촌공사와 관계 기관의 공식 안내를 먼저 따라 주세요.",
                    "물시계의 수치나 설명이 공식 정보와 다르면 공식 정보가 맞아요.",
                ),
            ),
            PolicySection(
                "내용은 바뀔 수 있어요",
                listOf("공공데이터 사정에 따라 화면과 수치가 달라질 수 있어요."),
            ),
        ),
    )

    PolicyKind.PRIVACY -> PolicyDoc(
        title = "개인정보 처리방침",
        intro = "물시계는 개인을 알아볼 수 있는 정보를 모으지 않아요.",
        sections = listOf(
            PolicySection(
                "모으는 정보가 적어요",
                listOf("이름·전화번호 같은 개인정보를 모으지 않아요. 가입도 없어요."),
            ),
            PolicySection(
                "기기에만 저장해요",
                listOf(
                    "고른 지역 코드, 대표 저수지 코드, 동의 기록만 이 기기에 저장해요.",
                    "이 정보는 회사 서버로 보내지 않아요.",
                ),
            ),
            PolicySection(
                "코치 설명을 만들 때",
                listOf(
                    "쉬운 설명을 만들 때는 저수율과 단계 같은 값만 비식별로 전달해요.",
                    "주소, 지역 이름처럼 개인이나 위치를 알 수 있는 정보는 보내지 않아요.",
                ),
            ),
            PolicySection(
                "지우는 방법",
                listOf("지역을 지우거나 앱의 저장 데이터를 비우면 기기에 남은 기록이 사라져요."),
            ),
        ),
    )
}

/**
 * 폴리시 문서 화면 — 순수 컴포저블(종류 + 뒤로 콜백만). 상단 뒤로가기 + 제목, 본문은
 * 소개 문단 + 섹션 목록이다. 문안은 초안이며 제출 전 사람 검토가 필요하다(상단 주석).
 */
@Composable
fun PolicyScreen(
    kind: PolicyKind,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val doc = docFor(kind)
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Bg)
            .verticalScroll(rememberScrollState()),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier
                    .clickable(onClick = onBack)
                    .semantics(mergeDescendants = true) { contentDescription = "이전으로 돌아가기" }
                    .size(48.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = "←", style = MaterialTheme.typography.headlineLarge, color = Ink)
            }
            Spacer(Modifier.width(4.dp))
            Text(
                text = doc.title,
                style = MaterialTheme.typography.titleLarge,
                color = Ink,
                modifier = Modifier.semantics { heading() },
            )
        }

        Column(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Text(
                text = doc.intro,
                style = MaterialTheme.typography.bodyLarge,
                color = Ink2,
            )
            doc.sections.forEach { section ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = section.heading,
                        style = MaterialTheme.typography.titleMedium,
                        color = Ink,
                        modifier = Modifier.semantics { heading() },
                    )
                    section.paragraphs.forEach { paragraph ->
                        Text(
                            text = paragraph,
                            style = MaterialTheme.typography.bodyLarge,
                            color = Ink2,
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}
