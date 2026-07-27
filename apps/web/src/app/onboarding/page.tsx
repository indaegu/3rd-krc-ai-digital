"use client";

// 온보딩 — 최초 사용자만 보는 3장 캐러셀(가로 스크롤 스냅 + 점 표시).
// CTA "내 지역 설정하기" → /regions(동의 바텀시트가 그곳에서 자동으로 열린다).
// 로그인·회원가입이 없음을 "가입 없이 바로 시작해요"로 안내한다.

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CtaButton } from "../../components/ui/CtaButton";
import { activeSlideIndex } from "./carousel-position";
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
    title: "지금 상태만 아니라\n앞으로 한 달을 보여드려요",
    body: "이 추세가 이어지면 다음 단계가\n언제인지 함께 계산해요.",
  },
  {
    image: "/brand/onboarding_3.png",
    title: "오늘 해야 할 물관리,\n딱 3가지로 정리해 드려요.",
    body: "어려운 그래프 대신,\n지금 할 일부터 짚어드려요.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const carouselRef = useRef<HTMLUListElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // 스크롤 위치에서 지금 보이는 장을 다시 계산한다. 표시점이 항상 첫 장에 멈춰 있으면
  // 몇 장이 남았는지 알 수 없어 캐러셀을 끝까지 넘겨보지 않는다.
  const syncActiveIndex = useCallback(() => {
    const carousel = carouselRef.current;
    if (carousel === null) return;
    const slides = Array.from(carousel.children).map((child) => {
      const element = child as HTMLElement;
      return {
        offsetLeft: element.offsetLeft,
        offsetWidth: element.offsetWidth,
      };
    });
    setActiveIndex(
      activeSlideIndex(carousel.scrollLeft, carousel.clientWidth, slides),
    );
  }, []);

  // 표시점을 눌러 이동 — 캐러셀을 밀지 못하는(또는 밀 줄 모르는) 사용자의 유일한 이동 수단이다.
  const goToSlide = (index: number) => {
    const carousel = carouselRef.current;
    const slide = carousel?.children.item(index) as HTMLElement | null;
    if (carousel === null || slide === null) return;
    // 움직임 줄이기를 켠 사용자에게는 부드러운 스크롤을 쓰지 않는다.
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof carousel.scrollTo === "function") {
      carousel.scrollTo({
        left: slide.offsetLeft,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    } else {
      // jsdom 등 scrollTo가 없는 환경 — 위치만 옮긴다.
      carousel.scrollLeft = slide.offsetLeft;
    }
    setActiveIndex(index);
  };

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

      <ul
        className={styles.carousel}
        aria-label="수신호 소개"
        ref={carouselRef}
        onScroll={syncActiveIndex}
      >
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

      <ol className={styles.dots} aria-label="소개 슬라이드 이동">
        {SLIDES.map((slide, index) => (
          <li key={slide.image}>
            <button
              type="button"
              className={styles.dotButton}
              // 스크린리더가 "현재 위치"를 읽도록 한다. 시각적 표시(dotOn)와 같은 근거다.
              aria-current={index === activeIndex ? "true" : undefined}
              aria-label={`${String(index + 1)}번째 소개 보기`}
              onClick={() => {
                goToSlide(index);
              }}
            >
              <span
                className={
                  index === activeIndex
                    ? `${styles.dot} ${styles.dotOn}`
                    : styles.dot
                }
              />
            </button>
          </li>
        ))}
      </ol>

      <div className={styles.ctaWrap}>
        <CtaButton onClick={() => router.push("/regions")}>
          내 지역 설정하기
        </CtaButton>
        <span className={styles.ctaSub}>가입 없이 바로 시작해요</span>
      </div>
    </main>
  );
}
