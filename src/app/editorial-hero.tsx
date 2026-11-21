"use client";

import Image from "next/image";
import { useRef } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import styles from "./editorial-hero.module.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function EditorialHero() {
  const root = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const bridge = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const motion = gsap.matchMedia();

    motion.add("(prefers-reduced-motion: no-preference)", () => {
      const scope = root.current;
      if (!scope) return;

      const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
      intro
        .from(photo.current, { scale: 1.09, duration: 1.6, ease: "power2.out" }, 0)
        .from(scope.querySelectorAll("[data-hero-kicker]"), { y: 18, opacity: 0, duration: 0.7 }, 0.12)
        .from(scope.querySelectorAll("[data-hero-line]"), { yPercent: 105, duration: 1.05, stagger: 0.13 }, 0.22)
        .from(scope.querySelectorAll("[data-hero-copy]"), { y: 18, opacity: 0, duration: 0.75 }, 0.65)
        .from(scope.querySelectorAll("[data-hero-action]"), { y: 18, opacity: 0, duration: 0.65, stagger: 0.1 }, 0.82)
        .from(scope.querySelectorAll("[data-hero-detail]"), { opacity: 0, duration: 0.7, stagger: 0.12 }, 1.0);

      if (bridge.current) {
        gsap.timeline({
          scrollTrigger: {
            trigger: bridge.current,
            start: "top 88%",
            end: "bottom 55%",
            scrub: 0.8,
            invalidateOnRefresh: true
          },
          defaults: { ease: "none" }
        })
          .from(scope.querySelectorAll("[data-bridge-rule]"), { scaleX: 0, transformOrigin: "left center" }, 0)
          .from(scope.querySelectorAll("[data-bridge-card]"), { y: 35, rotate: -5, opacity: 0 }, 0.06)
          .from(scope.querySelectorAll("[data-bridge-copy]"), { y: 24, opacity: 0 }, 0.18);
      }
    });

    return () => motion.revert();
  }, { scope: root });

  return (
    <div className={styles.visualFlow} ref={root}>
      <section className={styles.stage} aria-labelledby="bvm-hero-title">
        <div className={styles.story}>
          <div className={styles.storyTop} data-hero-kicker>
            <span className={styles.storyMark} aria-hidden="true">VM</span>
            <span>Bodegón &amp; cafetería<br />Mataderos, Buenos Aires</span>
          </div>

          <div className={styles.storyMain}>
            <p className={styles.edition} data-hero-kicker>Una invitación a quedarse · desde Mataderos</p>
            <h1 className={styles.title} id="bvm-hero-title" aria-label="Villa María">
              <span className={styles.titleLine}><span data-hero-line>Villa</span></span>
              <span className={styles.titleLine}><span data-hero-line>María<span className={styles.titleStop}>.</span></span></span>
            </h1>
            <p className={styles.description} data-hero-copy>
              Un espacio con alma porteña para comer rico, compartir y quedarse un rato más.
              Platos de bodegón, cafetería y encuentros sociales en Lisandro de la Torre.
            </p>
            <div className={styles.actions}>
              <a className={styles.menuCta} href="#menu" data-hero-action>
                <span>Ver menú</span>
                <span className={styles.ctaIcon} aria-hidden="true"><ArrowUpRight size={20} strokeWidth={1.8} /></span>
              </a>
              <a className={styles.contactCta} href="#contacto" data-hero-action>Contacto <ArrowRight size={17} aria-hidden="true" /></a>
            </div>
          </div>

          <div className={styles.storyBottom} data-hero-detail>
            <span>Buenos Aires · Argentina</span>
            <span className={styles.storyBottomLine} aria-hidden="true" />
            <span>Hecho para compartir</span>
          </div>
        </div>

        <div className={styles.photoPanel}>
          <Image
            ref={photo}
            className={styles.photo}
            src="/images/banner-bodegon-villa-maria.jpg"
            alt="Fachada de Bodegón Villa María en Mataderos"
            fill
            priority
            sizes="(max-width: 760px) 100vw, 56vw"
            onLoad={() => ScrollTrigger.refresh()}
          />
          <div className={styles.photoShade} aria-hidden="true" />
          <div className={styles.photoOutline} aria-hidden="true" data-hero-detail />
          <p className={styles.photoLabel} data-hero-detail>La casa de Villa María <span>01 / 02</span></p>
          <span className={styles.photoCorner} aria-hidden="true" data-hero-detail>VM<br /><small>2331</small></span>
        </div>
        <div className={styles.scrollCue} aria-hidden="true" data-hero-detail><span>Descubrí la carta</span><ArrowDown size={17} /></div>
      </section>

      <div className={styles.bridge} ref={bridge}>
        <div className={styles.bridgeInner}>
          <div className={styles.bridgeLead}>
            <span className={styles.bridgeIndex}>01&nbsp; / &nbsp;EL LUGAR</span>
            <div className={styles.bridgeRule} data-bridge-rule aria-hidden="true" />
            <span className={styles.bridgeIndex}>02&nbsp; / &nbsp;LA CARTA</span>
          </div>
          <div className={styles.bridgeCard} data-bridge-card aria-hidden="true">
            <span className={styles.cardTop}>VILLA MARÍA <span>·</span> MATADEROS</span>
            <span className={styles.cardMonogram}>VM</span>
            <span className={styles.cardBottom}>DESDE LA VEREDA, A TU MESA.</span>
          </div>
          <p className={styles.bridgeCopy} data-bridge-copy>Una fachada con historia.<br /><em>Una carta para quedarse.</em></p>
        </div>
      </div>
    </div>
  );
}
