"use client";

// 온보딩 — 최초 사용자만 보는 3장 캐러셀(가로 스크롤 스냅 + 점 표시).
// CTA "내 지역 설정하기" → /regions(동의 바텀시트가 그곳에서 자동으로 열린다).
// 로그인·회원가입이 없음을 "가입 없이 바로 시작해요"로 안내한다.

import { useRouter } from "next/navigation";

import { CtaButton } from "../../components/ui/CtaButton";
import styles from "./page.module.css";

interface Slide {
  image: string;
  title: string;
  body: string;
}

// Figma 확정 문구(SSOT). 제목의 줄바꿈(\n)은 slideTitle의 white-space: pre-line으로 표현한다.
const SLIDES: Slide[] = [
  {
    image: "/brand/onboarding_1.png",
    title: "우리 동네 물 사정을\n며칠 앞서 알려드려요",
    body: "저수지 데이터로 보는 물관리 코치, 수신호예요.",
  },
  {
    image: "/brand/onboarding_2.png",
    title: "지금 몇 %가 아니라\n'언제쯤'을 알려드려요",
    body: "이 추세가 이어지면 언제 다음 단계인지 미리 계산해요.",
  },
  {
    image: "/brand/onboarding_3.png",
    title: "오늘 해야 할 물관리,\n딱 3가지로 정리해 드려요.",
    body: "어려운 그래프 대신, 지금 할 일부터 짚어드려요.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <main className={styles.main}>
      <h1 className={styles.srOnly}>수신호 소개</h1>

      <header className={styles.brandHeader}>
        <p className={styles.tagline}>물의 내일을 먼저 알리다</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 브랜드 로고, 최적화 불필요 */}
        <img
          className={styles.logo}
          src="/brand/logo.svg"
          alt="수신호"
          width={150}
          height={41}
        />
      </header>

      <ul className={styles.carousel} aria-label="수신호 소개">
        {SLIDES.map((slide, index) => (
          <li key={index} className={styles.slide}>
            {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 온보딩 일러스트 */}
            <img
              className={styles.art}
              src={slide.image}
              alt=""
              aria-hidden="true"
              width={370}
              height={462}
            />
            <h2 className={styles.slideTitle}>{slide.title}</h2>
            <p className={styles.slideBody}>{slide.body}</p>
          </li>
        ))}
      </ul>

      <div className={styles.dots} aria-hidden="true">
        {SLIDES.map((_, index) => (
          <span
            key={index}
            className={
              index === 0 ? `${styles.dot} ${styles.dotOn}` : styles.dot
            }
          />
        ))}
      </div>

      <div className={styles.ctaWrap}>
        <CtaButton onClick={() => router.push("/regions")}>
          내 지역 설정하기
        </CtaButton>
        <span className={styles.ctaSub}>가입 없이 바로 시작해요</span>
      </div>
    </main>
  );
}
