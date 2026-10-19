/**
 * Maps stable service IDs (config/seed-settings.ts) to their content file.
 * Adding a service: create <id>.mdx exporting `meta`, then add a line here.
 */
import type { ComponentType } from "react";

export type ServiceMeta = {
  serviceId: string;
  headline: string;
  tagline: string;
  summary: string;
  bestFor: string;
  outcomes: string[];
  expect: string[];
  followUp?: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
};

type ServiceModule = { default: ComponentType; meta: ServiceMeta };
const mod = (p: Promise<unknown>) => p as Promise<ServiceModule>;

export const serviceContent: Record<string, () => Promise<ServiceModule>> = {
  "injury-assessment": () => mod(import("./injury-assessment.mdx")),
  "full-body-mot": () => mod(import("./full-body-mot.mdx")),
  "sports-massage": () => mod(import("./sports-massage.mdx")),
  "assisted-stretching": () => mod(import("./assisted-stretching.mdx")),
  "dry-cupping": () => mod(import("./dry-cupping.mdx")),
  "compression-boots": () => mod(import("./compression-boots.mdx")),
  "compression-boots-extended": () => mod(import("./compression-boots-extended.mdx")),
};

export async function loadServiceContent(id: string): Promise<ServiceModule | null> {
  const loader = serviceContent[id];
  return loader ? loader() : null;
}
