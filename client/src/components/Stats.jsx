import { stats } from "../constants";
import styles from "../style";

const Stats = () => (
  <section className={`${styles.flexCenter} flex-row flex-wrap gap-6 mb-2 px-4`}>
    {stats.map((stat) => (
      <div key={stat.id} className="flex-1 min-w-[180px] max-w-[260px] text-center py-4">
        <h4 className="font-poppins font-bold text-[36px] sm:text-[42px] leading-tight text-white">
          {stat.value}
        </h4>
        <p className="font-poppins font-medium text-[13px] sm:text-[14px] text-gradient uppercase tracking-[0.15em] mt-1">
          {stat.title}
        </p>
      </div>
    ))}
  </section>
);

export default Stats;
