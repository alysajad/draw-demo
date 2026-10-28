"use client";
import { motion } from "motion/react";
import { Result, rankName } from "@/lib/model";

function Hand({
  x,
  y,
  rotation,
  scale = 1,
  delay = 0,
}: {
  x: number;
  y: number;
  rotation: number;
  scale?: number;
  delay?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}>
      <motion.g
        initial={{ y: -100, rotate: -9, opacity: 0 }}
        animate={{ y: 0, rotate: 0, opacity: 1 }}
        transition={{ duration: 1.7, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        <path
          className="hand-outline"
          d="M18-65H111L109 60C125 80 142 104 138 127L116 183Q108 200 96 190L78 173L68 232Q65 249 52 246Q40 243 44 226L55 164L42 207Q37 224 25 219Q14 215 19 198L33 143L16 177Q9 191-2 184Q-12 178-5 163L22 106Q9 92 12 72Z"
        />
        <path
          className="hand-line"
          d="M109 60L79 96Q68 111 77 133L96 158L116 134M55 164L65 127M33 143L44 118M22 106L33 90M50 226L61 229M24 198L36 202M2 164L12 171M97 158L110 170L101 187M20 21L108 21"
        />
        <path className="hand-outline" d="M18-65H111V11H18Z" />
        <path className="hand-line" d="M29-49V-3M100-49V-3" />
      </motion.g>
    </g>
  );
}
export default function GoldenTicket({
  winner,
  prize,
  shown,
  reduced,
}: {
  winner: Result;
  prize: string;
  shown: boolean;
  reduced: boolean;
}) {
  const nameSize =
    winner.name.length > 45
      ? "ticket-name long-name"
      : winner.name.length > 24
        ? "ticket-name medium-name"
        : "ticket-name";
  return (
    <motion.div
      className="golden-reveal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0.15 : 0.65 }}
    >
      <div className="golden-grain" aria-hidden="true" />
      <div className="golden-artwork">
        <svg className="ticket-hands" viewBox="0 0 1000 760" aria-hidden="true">
          <Hand x={315} y={-75} rotation={-17} scale={1.4} />
          <Hand x={675} y={-100} rotation={24} scale={1.45} delay={0.18} />
          <Hand x={1070} y={407} rotation={96} scale={1.4} delay={0.35} />
          <Hand x={730} y={850} rotation={164} scale={1.5} delay={0.25} />
          <Hand x={180} y={810} rotation={207} scale={1.4} delay={0.45} />
          <Hand x={-80} y={290} rotation={-74} scale={1.3} delay={0.1} />
          {[
            [175, 210],
            [740, 180],
            [855, 365],
            [690, 620],
            [230, 620],
            [95, 480],
            [470, 110],
            [885, 580],
            [395, 660],
          ].map(([x, y], i) => (
            <motion.path
              key={i}
              d={`M${x - 13} ${y - 18}L${x} ${y - 4}L${x + 13} ${y - 18}L${x + 4} ${y}L${x + 13} ${y + 18}L${x} ${y + 4}L${x - 13} ${y + 18}L${x - 4} ${y}Z`}
              fill="#fffde8"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{ transformOrigin: `${x}px ${y}px` }}
              transition={{ duration: 0.45, delay: 0.8 + i * 0.09 }}
            />
          ))}
        </svg>
        <motion.div
          className="golden-ticket"
          initial={{
            y: reduced ? 0 : 100,
            scale: reduced ? 1 : 0.35,
            rotate: reduced ? 0 : -19,
            rotateY: reduced ? 0 : 70,
          }}
          animate={{ y: 0, scale: 1, rotate: shown ? -4 : -9, rotateY: 0 }}
          transition={{
            duration: reduced ? 0.15 : 2.2,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className="ticket-foil" aria-hidden="true" />
          <div className="ticket-perforation" aria-hidden="true" />
          <div className="ticket-topline">
            <span>NIPPON TOYOTA</span>
            <span>ONAM LUCKY DRAW</span>
          </div>
          <div className="golden-ticket-title">GOLDEN TICKET</div>
          <div className="ticket-rule" />
          <div className="ticket-winner-area">
            {shown ? (
              <motion.div
                initial={{ opacity: 0, y: reduced ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65 }}
              >
                <span className="ticket-rank">
                  {rankName(winner.rank)} PRIZE WINNER
                </span>
                <h2 className={nameSize}>{winner.name}</h2>
                <p className="ticket-entry">
                  {winner.entry_id}
                  {winner.showroom && ` · ${winner.showroom}`}
                </p>
                {prize && <p className="ticket-description">{prize}</p>}
              </motion.div>
            ) : (
              <div className="ticket-anticipation">
                A LITTLE GOOD FORTUNE IS COMING YOUR WAY.
              </div>
            )}
          </div>
          <div className="ticket-bottomline">
            <span>ONE UNFORGETTABLE JOURNEY</span>
            <span>✦</span>
            <span>
              {shown
                ? rankName(winner.rank).toUpperCase() + " PRIZE"
                : "YOUR MOMENT AWAITS"}
            </span>
          </div>
        </motion.div>
        <svg className="ticket-grips" viewBox="0 0 1000 760" aria-hidden="true">
          <g transform="translate(0 -100)">
            <motion.g
              initial={{ opacity: 0, y: -32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 1.4 }}
            >
              <path
                className="hand-outline"
                d="M378 190Q373 219 386 249L405 285Q416 305 432 295Q443 287 434 270L419 238Q438 223 443 204"
              />
              <path
                className="hand-line"
                d="M407 275L423 267L432 283Q429 294 418 291Z"
              />
            </motion.g>
          </g>
          <motion.g
            initial={{ opacity: 0, x: 35 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 1.7 }}
          >
            <path
              className="hand-outline"
              d="M883 429L834 410Q814 402 803 415Q795 430 814 440L861 464"
            />
            <path
              className="hand-line"
              d="M813 411Q801 420 814 432L830 438L835 419Z"
            />
          </motion.g>
        </svg>
      </div>
    </motion.div>
  );
}
