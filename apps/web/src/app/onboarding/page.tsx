"use client";

// 온보딩 — 최초 사용자만 보는 3장 캐러셀(가로 스크롤 스냅 + 점 표시).
// CTA "내 지역 설정하기" → /regions(동의 바텀시트가 그곳에서 자동으로 열린다).
// 로그인·회원가입이 없음을 "가입 없이 바로 시작해요"로 안내한다.

import { useRouter } from "next/navigation";

import { CtaButton } from "../../components/ui/CtaButton";
import styles from "./page.module.css";

interface Slide {
  bg: string;
  title: string;
  body: string;
  icon: React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    bg: "var(--blue-tint)",
    title: "우리 동네 물 사정을 며칠 앞서 알려드려요",
    body: "저수지 데이터로 보는 물관리 코치, 물시계예요.",
    icon: (
      <svg viewBox="0 0 24 24" fill="var(--blue)">
        <path d="M12 2C12 2 5 10.2 5 15a7 7 0 0 0 14 0C19 10.2 12 2 12 2Z" />
      </svg>
    ),
  },
  {
    bg: "var(--ok-bg)",
    title: "지금 몇 %가 아니라 ‘며칠 뒤’를 알려드려요",
    body: "이 추세가 이어지면 언제 다음 단계인지 미리 계산해요.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ok-fg)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="17" rx="3" />
        <path d="M8 2v4M16 2v4M3 9h18" />
        <path d="M9 15.5l2 2 4-4" />
      </svg>
    ),
  },
  {
    bg: "var(--watch-bg)",
    title: "오늘 해야 할 물관리, 딱 3가지로 정리해드려요",
    body: "어려운 그래프 대신, 지금 할 일부터 짚어드려요.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--watch-fg)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6h10M4 12h10M4 18h10" />
        <path d="M17 5.5l1.5 1.5L21 4.5M17 11.5l1.5 1.5L21 10.5M17 17.5l1.5 1.5L21 16.5" />
      </svg>
    ),
  },
];

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <main className={styles.main}>
      <h1 className={styles.srOnly}>물시계 소개</h1>

      <ul className={styles.carousel} aria-label="물시계 소개">
        {SLIDES.map((slide, index) => (
          <li key={index} className={styles.slide}>
            <span
              className={styles.art}
              style={{ background: slide.bg }}
              aria-hidden="true"
            >
              {slide.icon}
            </span>
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
