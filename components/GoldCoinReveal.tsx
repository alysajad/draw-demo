"use client";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { Result, rankName } from "@/lib/model";

function Coin({ hero = false }: { hero?: boolean }) {
  return <div className={`gold-coin ${hero ? "hero-coin" : ""}`}>
    <div className="coin-face"><span className="coin-brand">NIPPON TOYOTA</span><span className="coin-emblem">✦</span><span className="coin-inscription">GOLDEN MOMENTS</span></div>
  </div>;
}

function GiftBox() {
  return <div className="gift-illustration" aria-hidden="true">
    <div className="gift-halo" />
    <div className="gift-shadow" />
    <svg className="gift-ribbons" viewBox="0 0 600 440" fill="none">
      <defs><linearGradient id="ribbonGold"><stop stopColor="#916000"/><stop offset=".25" stopColor="#ffe267"/><stop offset=".45" stopColor="#fff4af"/><stop offset=".6" stopColor="#d89400"/><stop offset=".8" stopColor="#ffdc39"/><stop offset="1" stopColor="#a76d00"/></linearGradient></defs>
      <path d="M200 295C104 216 62 287 122 334C164 371 63 387 57 332" stroke="url(#ribbonGold)" strokeWidth="27"/>
      <path d="M418 291C517 240 554 286 496 318C460 341 537 398 572 346" stroke="url(#ribbonGold)" strokeWidth="24"/>
    </svg>
    <svg className="gift-base" viewBox="0 0 600 440">
      <defs>
        <linearGradient id="boxFront" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff484"/><stop offset=".2" stopColor="#ffdc35"/><stop offset=".55" stopColor="#efb700"/><stop offset=".78" stopColor="#ffe555"/><stop offset="1" stopColor="#bd8200"/></linearGradient>
        <linearGradient id="boxSide"><stop stopColor="#eab800"/><stop offset=".45" stopColor="#ffdf39"/><stop offset="1" stopColor="#a67100"/></linearGradient>
        <linearGradient id="boxInside" x2="0" y2="1"><stop stopColor="#916009"/><stop offset="1" stopColor="#ffdb55"/></linearGradient>
      </defs>
      <path d="M144 243L292 206L463 248L320 292Z" fill="url(#boxInside)" stroke="#ffe78b" strokeWidth="3"/>
      <path d="M144 243L320 285L313 414L153 366Z" fill="url(#boxSide)"/>
      <path d="M320 285L463 248L447 374L313 414Z" fill="url(#boxFront)"/>
      <path d="M144 243L320 285L463 248M320 285L313 414" fill="none" stroke="#fff2a0" strokeWidth="2"/>
      <g transform="matrix(.98 .27 -.05 1 185 291)" fill="#44320c"><text fontSize="28">✦</text><text y="32" fontSize="9" letterSpacing="2">NIPPON</text><text y="46" fontSize="9" letterSpacing="2">TOYOTA</text></g>
      <g transform="matrix(1 -.27 -.10 1 350 312)" fill="#4d390d" fontSize="10" letterSpacing="3"><text>GOOD</text><text y="17">FORTUNE.</text><text y="34">GOLDEN</text><text y="51">JOURNEYS.</text></g>
    </svg>
    <div className="gift-light" />
    <div className="gift-hero-coin"><Coin hero /></div>
    <div className="gift-lid">
      <svg viewBox="0 0 600 440">
        <defs>
          <linearGradient id="lidIvory" x2=".7" y2="1"><stop stopColor="#fffef7"/><stop offset=".5" stopColor="#f4edde"/><stop offset="1" stopColor="#c5bba0"/></linearGradient>
          <linearGradient id="lidGold"><stop stopColor="#a36b00"/><stop offset=".25" stopColor="#ffd62d"/><stop offset=".45" stopColor="#fff2a5"/><stop offset=".65" stopColor="#d19a00"/><stop offset="1" stopColor="#ffdc43"/></linearGradient>
        </defs>
        <path d="M295 207C229 184 233 123 263 134C288 143 295 181 295 207ZM305 207C312 139 365 125 365 155C364 182 327 202 305 207Z" fill="none" stroke="url(#lidGold)" strokeWidth="22"/>
        <path d="M305 202C346 184 375 182 390 209S425 242 448 215" fill="none" stroke="url(#lidGold)" strokeWidth="17"/>
        <path d="M138 227L289 187L470 230L319 273Z" fill="url(#lidIvory)" stroke="#fff9e8" strokeWidth="2"/>
        <path d="M138 227L319 273L319 295L138 248Z" fill="url(#lidGold)"/>
        <path d="M319 273L470 230L469 252L319 295Z" fill="#e5dbc5"/>
        <path d="M226 203L256 196L438 238L410 247Z" fill="url(#lidGold)"/>
        <path d="M410 247L438 238L438 260L410 268Z" fill="url(#lidGold)"/>
        <path d="M355 203L386 211L233 252L204 245Z" fill="url(#lidGold)"/>
        <path d="M204 245L233 252L233 273L204 265Z" fill="#d39c00"/>
      </svg>
    </div>
    {[0,1,2,3,4,5].map(i => <span key={i} className={`gift-spark gift-spark-${i}`}>✦</span>)}
  </div>;
}

export default function GoldCoinReveal({ winner, prize, shown, reduced }: {
  winner: Result; prize: string; shown: boolean; reduced: boolean;
}) {
  return <motion.div className={`coin-reveal ${shown ? "coin-revealed" : ""} ${reduced ? "coin-reduced" : ""}`}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? .15 : .7 }}>
    {shown && !reduced && <div className="coin-rain" aria-hidden="true">
      {Array.from({ length: 34 }, (_, i) => <div className="falling-coin" key={i} style={{
        left: `${(i * 37 + 3) % 100}%`, "--delay": `${(i % 12) * .22}s`,
        "--duration": `${3.8 + (i % 5) * .43}s`, "--drift": `${(i % 2 ? 1 : -1) * (30 + i % 7 * 14)}px`,
        "--size": `${22 + i % 4 * 10}px`, "--spin": `${i % 2 ? 720 : -720}deg`,
      } as CSSProperties}><Coin /></div>)}
    </div>}
    <div className="coin-editorial coin-editorial-left">A little luck.<br/><em>A golden moment.</em></div>
    <div className="coin-editorial coin-editorial-right">A SEASON OF<br/>TOGETHERNESS<span /></div>
    <div className="coin-composition">
      <GiftBox />
      <div className="coin-result">
        <p className="coin-kicker">{winner.showroom || "NIPPON TOYOTA"} · ONAM LUCKY DRAW</p>
        <h2 className={`coin-title ${shown ? "coin-winner" : ""} ${shown && winner.name.length > 45 ? "coin-long-name" : ""}`}>{shown ? winner.name : "GOOD FORTUNE AWAITS."}</h2>
        <div className="coin-divider"><span />✦<span /></div>
        {shown ? <motion.div initial={{ opacity: 0, y: reduced ? 0 : 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7 }}>
          <p className="coin-rank">CONGRATULATIONS · {rankName(winner.rank)} PRIZE WINNER</p>
          <dl className="coin-customer">
            <div><dt>Car</dt><dd>{winner.vehicle || "Not provided"}</dd></div>
            <div><dt>Mobile no.</dt><dd>{winner.mobile || "Not provided"}</dd></div>
          </dl>
          <p className="coin-entry">{winner.entry_id}{winner.showroom && ` · ${winner.showroom}`}</p>
          <p className="coin-prize">{prize || "Gold coin"}</p>
        </motion.div> : <p className="coin-anticipation">Something golden is coming your way.</p>}
      </div>
    </div>
  </motion.div>;
}
