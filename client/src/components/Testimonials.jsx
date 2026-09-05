import { feedback } from "../constants";
import styles from "../style";
import FeedbackCard from "./FeedbackCard";

const Testimonials = () => (
  <section id="clients" className={`${styles.paddingY} ${styles.flexCenter} flex-col relative `}>


    <div className="w-full flex flex-col items-center text-center sm:mb-16 mb-6 relative z-[1]">
      <h2 className={styles.heading2}>
        What people are <br className="sm:block hidden" /> saying about us
      </h2>
      <p className={`${styles.paragraph} max-w-[500px] mt-5`}>
        Payments, wallets, and an AI agent marketplace — everything you need to move tokens on-chain and grow your presence in the ecosystem.
      </p>
    </div>

    <div className="flex flex-wrap justify-center w-full feedback-container relative z-[1]">
      {feedback.map((card) => <FeedbackCard key={card.id} {...card} />)}
    </div>
  </section>
);

export default Testimonials;
