import { people01, people02, people03, facebook, instagram, linkedin, twitter, airbnb, binance, coinbase, dropbox, send, shield, star } from "../assets";
export const navLinks = [
  {
    id: "dashboard",
    title: "Overview",
    redirect: '/overview'
  },
  {
    id: "payments",
    title: "Payments",
    redirect: '/payments'
  },
  {
    id: "transactions",
    title: "Transfers",
    redirect: '/transfers'
  },
  {
    id: "profile",
    title: "Profile",
    redirect: '/profile'
  },
  {
    id: "developer",
    title: "Developer",
    redirect: '/developer'
  },
];
export const features = [
  {
    id: "feature-1",
    icon: star,
    title: "Graph-Powered Trust",
    content:
      "Before an AI agent pays, GlobalPay checks real on-chain payment evidence from The Graph to decide which provider is trustworthy.",
  },
  {
    id: "feature-2",
    icon: shield,
    title: "USDC Settlement on Arc",
    content:
      "Consumer agents pay providers with native USDC on Arc. Every payment is settled on-chain and verifiable via ArcScan.",
  },
  {
    id: "feature-3",
    icon: send,
    title: "Human-Backed Agent Identity",
    content:
      "World ID proves a real human backs each agent. AgentBook links wallets to verified publishers for durable identity and accountability.",
  },
];

export const feedback = [
  {
    id: "feedback-1",
    content:
      "GlobalPay lets our agent discover OCR providers, check their on-chain trust score via The Graph, and pay with USDC — all autonomously. The trust layer is the killer feature.",
    name: "Agent Builder",
    title: "Early Adopter",
    img: people01,
  },
  {
    id: "feedback-2",
    content:
      "Published our OCR agent on the marketplace with World ID verification. The Graph indexes our settlements and the Trust Engine ranks us by real evidence. World-class developer experience.",
    name: "AI Builder",
    title: "Agent Developer",
    img: people02,
  },
  {
    id: "feedback-3",
    content:
      "Autonomous commerce with policy controls, Arc settlement, and Graph verification — all in one platform. This is what the AI agent economy needed.",
    name: "Ecosystem Partner",
    title: "Builder",
    img: people03,
  },
];

export const stats = [
  {
    id: "stats-1",
    title: "AI Agents Built",
    value: "50+",
  },
  {
    id: "stats-2",
    title: "On-Chain Settlements",
    value: "Live",
  },
  {
    id: "stats-3",
    title: "Developer Pages",
    value: "60+",
  },
];

export const footerLinks = [
  {
    title: "Platform",
    links: [
      {
        name: "Developer Console",
        link: "/developer",
      },
      {
        name: "AI Marketplace",
        link: "/developer/marketplace/browse",
      },
      {
        name: "API Documentation",
        link: "/developer/api",
      },
      {
        name: "Webhooks",
        link: "/developer/webhooks",
      },
      {
        name: "Playground",
        link: "/developer/playground",
      },
    ],
  },
  {
    title: "Ecosystem",
    links: [
      {
        name: "Documentation",
        link: "/developer/api",
      },
      {
        name: "GitHub",
        link: "https://github.com/vi5hnuraj",
        external: true,
      },
      {
        name: "Twitter",
        link: "https://x.com/Code2Crypt0",
        external: true,
      },
      {
        name: "Changelog",
        link: "/developer/changelog",
      },
    ],
  },
  {
    title: "Company",
    links: [
      {
        name: "About",
        link: "/help",
      },
      {
        name: "Help Center",
        link: "/help",
      },
      {
        name: "Terms of Service",
        link: "/terms",
      },
      {
        name: "Privacy Policy",
        link: "/privacy",
      },
      {
        name: "Refund Policy",
        link: "/refund",
      },
      {
        name: "Contact",
        link: "/help",
      },
    ],
  },
  {
    title: "Legal",
    links: [
      {
        name: "Cookie Policy",
        link: "/cookies",
      },
      {
        name: "Disclaimer",
        link: "/disclaimer",
      },
      {
        name: "Security Policy",
        link: "/security",
      },
      {
        name: "Acceptable Use",
        link: "/acceptable-use",
      },
    ],
  },
];

export const socialMedia = [
  {
    id: "social-media-1",
    icon: twitter,
    link: "https://x.com/GlobalPay_ai",
  },
];

export const clients = [
  {
    id: "client-1",
    logo: airbnb,
  },
  {
    id: "client-2",
    logo: binance,
  },
  {
    id: "client-3",
    logo: coinbase,
  },
  {
    id: "client-4",
    logo: dropbox,
  },
];