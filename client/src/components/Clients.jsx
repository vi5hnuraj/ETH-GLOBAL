const partners = [
  { id: 'partner-1', name: 'Blockchain' },
  { id: 'partner-2', name: 'MPC Wallet' },
  { id: 'partner-3', name: 'On-Chain Settlements' },
  { id: 'partner-4', name: 'AI Agents' },
];

const Clients = () => (
  <section className="flex justify-center items-center my-10 px-6">
    <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-14">
      {partners.map((p) => (
        <div key={p.id} className="group cursor-default">
          <span className="text-zinc-400 font-extrabold text-xl sm:text-2xl tracking-[0.12em] uppercase group-hover:text-emerald-400 transition-all duration-500 group-hover:tracking-[0.2em]">
            {p.name}
          </span>
        </div>
      ))}
    </div>
  </section>
);

export default Clients;
