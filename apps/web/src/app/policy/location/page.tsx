// 초안 · 제출 전 사람 검토 필요 — 법적 최종 문안이 아니다(docs/contest-rules.md 근거).
// 위치기반 서비스 이용약관: 주소 미저장·기기 저장·서버 미전송 원칙을 밝힌다.

import { PolicyDoc } from "../PolicyDoc";

export default function LocationPolicyPage() {
  return (
    <PolicyDoc
      title="위치기반 서비스 이용약관"
      intro="물시계는 우리 지역 대표 저수지를 찾는 데에만 위치 정보를 써요."
      sections={[
        {
          heading: "무엇에 쓰나요",
          paragraphs: [
            "검색한 주소는 시군구를 확인하고 우리 지역 대표 저수지를 정하는 데에만 써요.",
          ],
        },
        {
          heading: "주소는 저장하지 않아요",
          paragraphs: [
            "대표 저수지를 정한 뒤에는 주소 원문과 검색어를 바로 지워요.",
            "주소는 이 기기에도, 회사 서버에도 저장하지 않아요.",
          ],
        },
        {
          heading: "기기에만 남는 정보",
          paragraphs: [
            "고른 지역 코드와 대표 저수지 코드만 이 기기에 저장해요.",
            "이 코드는 회사 서버로 보내지 않아요.",
          ],
        },
        {
          heading: "언제든 지울 수 있어요",
          paragraphs: [
            "지역 설정에서 지역을 지우면 기기에 남은 코드도 함께 사라져요.",
          ],
        },
      ]}
    />
  );
}
