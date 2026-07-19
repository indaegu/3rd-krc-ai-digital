import { HealthCard } from "@/components/HealthCard";

import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>AI 물관리 코치</p>
        <h1>물시계</h1>
        <p>우리 지역 물 사정을 살피고, 지금 할 일을 쉬운 말로 알려드려요.</p>
      </section>
      <HealthCard />
      <p className={styles.notice}>
        예측은 참고 정보예요. 공식 가뭄 예·경보를 먼저 확인해 주세요.
      </p>
    </main>
  );
}
