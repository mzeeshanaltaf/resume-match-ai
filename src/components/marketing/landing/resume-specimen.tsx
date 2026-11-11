"use client";

import type { MotionValue } from "motion/react";
import {
  Circled,
  Insert,
  MarginNote,
  ScoreMark,
  Strike,
  Underlined,
} from "@/components/proof";

/**
 * A resume page being marked up by the editor. Everything on it is sample
 * content. `progress` (0..1) decides how much of the markup is drawn: the hero
 * feeds it scroll progress on large screens and a timer elsewhere.
 *
 * The sheet is a size container: text scales with its width (`cqw`), and the
 * margin notes hang in the right margin once the sheet is wide enough, or fall
 * under the line they refer to when it is narrow.
 */

// A margin note: under its line when narrow, hung in the margin when wide.
const NOTE =
  "mt-2 block text-[1.55em] @sm:absolute @sm:left-[106%] @sm:top-0 @sm:mt-0 @sm:w-[52%]";
// Rows that carry a two-line note keep room for it.
const ROW = "relative @sm:min-h-[3.3em]";
const HEADING =
  "mt-[1.2em] border-b border-page-rule pb-[0.2em] text-[0.95em] font-bold";

export function ResumeSpecimen({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="@container w-full">
      <div
        className="relative overflow-hidden rounded-page bg-page px-[7%] pb-[7%] pt-[6%] font-serif text-[13px] leading-[1.55] text-page-foreground shadow-sheet @sm:text-[clamp(10px,2.55cqw,15px)]"
        role="img"
        aria-label="A sample resume with an editor's marks. '4 years' is underlined because the posting wants 5 or more. A vague line about reporting tasks is struck out. 'A/B tests' is circled in blue as matching the posting's first requirement. The word SQL is inserted into the skills line because the posting names it twice. A score of 78 percent is written in the corner."
      >
        {/* The grade, written in the top-right corner */}
        <div className="absolute right-[5%] top-[2.5%] text-[4.4em] leading-none">
          <ScoreMark
            value="78"
            suffix="%"
            progress={progress}
            range={[0.8, 0.96]}
          />
        </div>

        <div className="@sm:w-[62%]">
          <div className="max-w-[66%] @sm:max-w-none">
          <p className="text-[1.55em] font-bold leading-tight tracking-tight">
            Maya Okafor
          </p>
          <p className="text-[0.92em] text-page-muted">
            Product analyst · Lisbon · maya.okafor@example.com
          </p>
          </div>

          <p className={HEADING}>Summary</p>
          <div className={ROW + " mt-[0.5em]"}>
            <p>
              Analyst with{" "}
              <Underlined surface="page" progress={progress} range={[0.06, 0.15]}>
                4 years
              </Underlined>{" "}
              in consumer apps and growth.
            </p>
            <span className={NOTE}>
              <MarginNote progress={progress} range={[0.12, 0.2]}>
                asks for five years or more
              </MarginNote>
            </span>
          </div>
          <div className={ROW}>
            <p>
              <Strike surface="page" progress={progress} range={[0.22, 0.31]}>
                Responsible for various reporting tasks.
              </Strike>
            </p>
            <span className={NOTE}>
              <MarginNote progress={progress} range={[0.29, 0.38]}>
                vague. what did it change?
              </MarginNote>
            </span>
          </div>

          <p className={HEADING}>Experience</p>
          <p className="mt-[0.5em] flex justify-between gap-2 font-semibold">
            <span>Product Analyst, Brightpath</span>
            <span className="font-normal text-page-muted">2022 to now</span>
          </p>
          <ul className="mt-[0.3em] space-y-[0.3em] pl-[1.1em] [&>li]:list-disc">
            <li className={ROW}>
              Designed and read out{" "}
              <Circled
                tone="proof"
                surface="page"
                progress={progress}
                range={[0.44, 0.56]}
              >
                A/B tests
              </Circled>{" "}
              on onboarding
              <span className={NOTE}>
                <MarginNote tone="proof" progress={progress} range={[0.54, 0.62]}>
                  matches their first ask
                </MarginNote>
              </span>
            </li>
            <li>Built weekly Looker dashboards for three squads</li>
            <li>Answered ad-hoc data requests from growth</li>
          </ul>

          <p className={HEADING}>Skills</p>
          <div className={ROW + " mt-[0.5em] leading-[2.1]"}>
            <p>
              Looker, Python,
              <Insert
                word="SQL"
                surface="page"
                progress={progress}
                range={[0.66, 0.76]}
              />{" "}
              Excel, Google Analytics
            </p>
            <span className={NOTE + " leading-[1.05]"}>
              <MarginNote progress={progress} range={[0.74, 0.82]}>
                they name SQL twice. add it
              </MarginNote>
            </span>
          </div>

          <p className={HEADING}>Education</p>
          <p className="mt-[0.5em]">BSc Statistics, University of Porto</p>
        </div>
      </div>
    </div>
  );
}
