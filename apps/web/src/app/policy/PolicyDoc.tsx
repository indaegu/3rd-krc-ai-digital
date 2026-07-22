// 폴리시 문서 공용 레이아웃(약관·개인정보·면책). 폴리시 화면 3종이 공유한다.
// 라우트가 아니므로(page.tsx 아님) 이 파일은 페이지로 노출되지 않는다.

import Link from "next/link";

import styles from "./PolicyDoc.module.css";

export interface PolicySection {
  heading: string;
  paragraphs: string[];
}

interface PolicyDocProps {
  title: string;
  intro: string;
  sections: PolicySection[];
}

export function PolicyDoc({ title, intro, sections }: PolicyDocProps) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link
          href="/regions"
          className={styles.back}
          aria-label="이전으로 돌아가기"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className={styles.title}>{title}</h1>
      </header>

      <p className={styles.intro}>{intro}</p>

      {sections.map((section) => (
        <section key={section.heading} className={styles.section}>
          <h2 className={styles.heading}>{section.heading}</h2>
          {section.paragraphs.map((paragraph, index) => (
            <p key={index} className={styles.paragraph}>
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
