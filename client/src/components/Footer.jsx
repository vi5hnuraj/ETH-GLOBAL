import styles from "../style";
import logoImg from "../assets/logo.jpeg";
import { footerLinks, socialMedia } from "../constants";
import { Link } from 'react-router-dom';

const Footer = () => (
  <section className={`${styles.flexCenter} ${styles.paddingY} flex-col`}>
    <div className={`${styles.flexStart} md:flex-row flex-col mb-8 w-full`}>
      <div className="flex-[1] flex flex-col justify-start mr-10">
        <div className="flex items-center gap-3 mb-2">
          <img src={logoImg} alt="GlobalPay" className="h-10 w-10 object-contain rounded-lg" />
          <h1 className="text-3xl text-gradient font-extrabold">GlobalPay</h1>
        </div>
        <p className={`${styles.paragraph} mt-4 max-w-[312px]`}>
          Send, receive, and manage tokens across multiple chains. Plus build and publish AI agents on the marketplace.
        </p>
      </div>

      <div className="flex-[1.5] w-full flex flex-row justify-between flex-wrap md:mt-0 mt-10">
        {footerLinks.map((footerlink) => (
          <div key={footerlink.title} className={`flex flex-col ss:my-0 my-4 min-w-[150px]`}>
            <h4 className="font-poppins font-medium text-[18px] leading-[27px] text-white">
              {footerlink.title}
            </h4>
            <ul className="list-none mt-4">
              {footerlink.links.map((link, index) => (
                <li
                  key={link.name}
                  className={`font-poppins font-normal text-[16px] leading-[24px] text-dimWhite hover:text-secondary ${index !== footerlink.links.length - 1 ? "mb-4" : "mb-0"
                    }`}
                >
                  {link.link.startsWith('/') ? (
                    <Link to={link.link} className="hover:text-secondary">{link.name}</Link>
                  ) : link.link.startsWith('http') ? (
                    <a href={link.link} target="_blank" rel="noopener noreferrer" className="hover:text-secondary">{link.name}</a>
                  ) : (
                    <span className="cursor-pointer">{link.name}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>

    <div className="w-full flex justify-between items-center md:flex-row flex-col pt-6 border-t-[1px] border-t-[#3F3E45]">
      <p className="font-poppins font-normal text-center text-[18px] leading-[27px] text-white">
        Copyright Ⓒ 2026 GlobalPay. All Rights Reserved.
      </p>

      <div className="flex flex-row md:mt-0 mt-6">
        {socialMedia.map((social, index) => (
          <img
            key={social.id}
            src={social.icon}
            alt={social.id}
            className={`w-[21px] h-[21px] object-contain cursor-pointer ${index !== socialMedia.length - 1 ? "mr-6" : "mr-0"
              }`}
            onClick={() => window.open(social.link)}
          />
        ))}
      </div>
    </div>
  </section>
);

export default Footer;
