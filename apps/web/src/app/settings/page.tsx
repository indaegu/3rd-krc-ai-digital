// 앱 환경설정 — 메인 헤더의 톱니로 들어오는 설정 모음. 각 항목은 기존 화면으로 가는 링크라
// 이 페이지 자체는 상태를 갖지 않는다.
//
// 웹에는 알림 기능이 없으므로 알림 관련 항목·문구를 두지 않는다(apps/web/AGENTS.md 규칙).

import Link from "next/link";

import styles from "./page.module.css";

const ROWS: { href: string; title: string; description?: string }[] = [
  {
    href: "/regions",
    title: "지역 설정",
    description: "우리 지역을 추가하거나 대표 지역을 바꿔요",
  },
  { href: "/policy/terms", title: "서비스 이용약관" },
  { href: "/policy/privacy", title: "개인정보 처리방침" },
  { href: "/policy/location", title: "위치정보 이용약관" },
];

export default function SettingsPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={styles.back} aria-label="뒤로">
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className={styles.title}>앱 환경설정</h1>
      </header>

      <ul className={styles.list}>
        {ROWS.map((row) => (
          <li key={row.href}>
            <Link href={row.href} className={styles.row}>
              <span className={styles.rowBody}>
                <strong className={styles.rowTitle}>{row.title}</strong>
                {row.description === undefined ? null : (
                  <span className={styles.rowDesc}>{row.description}</span>
                )}
              </span>
              <span className={styles.chevron} aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
