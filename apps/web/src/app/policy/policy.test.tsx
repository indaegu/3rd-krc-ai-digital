import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import LocationPolicy from "./location/page";
import PrivacyPolicy from "./privacy/page";
import TermsPolicy from "./terms/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pages = [
  ["위치기반 서비스 이용약관", LocationPolicy],
  ["서비스 이용약관", TermsPolicy],
  ["개인정보 처리방침", PrivacyPolicy],
] as const;

describe("폴리시 화면 콘텐츠 가드", () => {
  it.each(pages)(
    "%s에는 로그인·알림·'가까운 저수지' 문구가 없다",
    (_name, Page) => {
      const { container } = render(<Page />);

      expect(container.textContent).not.toMatch(/로그인/);
      expect(container.textContent).not.toMatch(/알림/);
      expect(container.textContent).not.toMatch(/가까운 저수지/);
    },
  );

  it("위치 폴리시는 주소를 저장하지 않는다는 점을 밝힌다", () => {
    const { container } = render(<LocationPolicy />);
    expect(container.textContent).toMatch(/저장하지 않아요/);
  });

  // 회귀 방지: 상태·예측·코치 조회는 sigunCode를 /api/v1/*로 전송하므로,
  // 정책은 코드 미전송을 잘못 고지하면 안 되고 조회 전송을 밝혀야 한다.
  it("위치·개인정보 폴리시는 지역 코드가 조회에 전송됨을 밝히고 미전송 오고지가 없다", () => {
    for (const Page of [LocationPolicy, PrivacyPolicy]) {
      const { container } = render(<Page />);
      expect(container.textContent).toMatch(
        /지역 코드를 우리 API 서버로 보내요/,
      );
      expect(container.textContent).not.toMatch(
        /코드는 회사 서버로 보내지 않아요/,
      );
      expect(container.textContent).not.toMatch(
        /이 정보는 회사 서버로 보내지 않아요/,
      );
      cleanup();
    }
  });

  it("이용약관은 예측이 참고이고 공식 예·경보가 우선임을 밝힌다", () => {
    const { container } = render(<TermsPolicy />);
    expect(container.textContent).toMatch(/공식 가뭄 예·경보가 우선/);
  });
});
