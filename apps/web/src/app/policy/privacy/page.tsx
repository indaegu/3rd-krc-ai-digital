// 초안 · 제출 전 사람 검토 필요 — 법적 최종 문안이 아니다(docs/contest-rules.md 근거).
// 개인정보 처리방침: 기기 저장·서버 미전송·코치 LLM 비식별 입력 원칙을 밝힌다.

import { PolicyDoc } from "../PolicyDoc";

export default function PrivacyPolicyPage() {
  return (
    <PolicyDoc
      title="개인정보 처리방침"
      intro="물시계는 개인을 알아볼 수 있는 정보를 모으지 않아요."
      sections={[
        {
          heading: "모으는 정보가 적어요",
          paragraphs: [
            "이름·전화번호 같은 개인정보를 모으지 않아요. 가입도 없어요.",
          ],
        },
        {
          heading: "기기에만 저장해요",
          paragraphs: [
            "고른 지역 코드, 대표 저수지 코드, 동의 기록만 이 기기에 저장해요.",
            "이 정보는 회사 서버로 보내지 않아요.",
          ],
        },
        {
          heading: "코치 설명을 만들 때",
          paragraphs: [
            "쉬운 설명을 만들 때는 저수율과 단계 같은 값만 비식별로 전달해요.",
            "주소, 지역 이름처럼 개인이나 위치를 알 수 있는 정보는 보내지 않아요.",
          ],
        },
        {
          heading: "지우는 방법",
          paragraphs: [
            "지역을 지우거나 브라우저 저장소를 비우면 남은 기록이 사라져요.",
          ],
        },
      ]}
    />
  );
}
