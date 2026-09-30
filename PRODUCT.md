# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a production manager at a mid-tier Bangladeshi garment plant, at a desk or laptop during a shift. They need to see which line, machine, or quality issue needs a decision, and act on it. Judges and demo visitors are a secondary audience. When those needs conflict, the shift wins: demo paths stay available and stay quiet.

## Product Purpose

BunonBrain is the operations layer for that plant. It shows live line, machine, energy, and quality signals, runs a small AI workforce (line throughput, maintenance, manager orchestrator), and asks the manager to approve actions that carry risk. Success is finding what needs a human and completing that decision without a guided tour.

## Positioning

A factory brain over plant signals: line board, sensor ticks, QC, vision samples, and agent recommendations in one place, in English and Bangla. The current build runs on labeled simulated data so a demo works without external accounts. A configured LLM key upgrades Ask and agent runs to live inference.

## Operating Context

The manager moves through an authenticated app: overview, approvals, QC, activity, Ask, the brain graph, insights, agents, vision, integrations, and settings. A public landing page and a short onboarding flow lead in. The Next.js app proxies `/api/*` to an ASP.NET API. English and Bangla are first-class. Simulated results stay labeled as simulated.

## Capabilities and Constraints

- Keep the existing screens, copy, and behavior. Replace the visual language.
- Keep route slugs and primary navigation labels.
- Frontend is Next.js 15, React 18, Tailwind CSS 3, Zustand, and the existing Lucide icon set. Do not swap the framework or icon family as part of the visual pass.
- Bangla uses Hind Siliguri alongside the Latin UI face.
- Light, dark, and system theme already exist and must keep working.
- The API may be offline in local frontend-only runs. Those states must explain the failure.
- Do not invent customers, benchmarks, or capabilities the product does not have.

## Brand Commitments

The product name is BunonBrain. The wordmark and bilingual voice stay. The user rejected the incumbent look (dark canvas, mint accent, glass, blur). They then chose the category standard for the replacement: a calm operations dashboard with a sidebar, neutral surfaces, and one accent, played straight, without quirk. The craft bar is Linear, Notion, and Vercel: quiet chrome, clear type, one accent, and dense information that stays easy to scan. The PNG at `public/Thalamus_logo.png` is a legacy asset, not a requirement to keep the old glyph.

## Evidence on Hand

Screens and copy live in `src/app`, `src/components`, and `src/i18n/en.ts` / `src/i18n/bn.ts`. Plant content is synthetic demo data. There are no customer testimonials or production metrics to cite.

## Product Principles

- The shift task is the layout. Demo choreography does not lead a screen.
- One screen has one primary action. Exceptions (down machines, waiting approvals, QC flags) outrank healthy averages.
- English and Bangla stay equal. Labels do not hardcode one language.
- Simulated data stays visibly simulated.
- Familiar controls. Expression never hides state, focus, or what happens next.

## Accessibility & Inclusion

Both languages must remain readable, including Bangla. Respect reduced motion. Interactive controls need a visible focus state in light and dark. Target WCAG AA for text and controls.
