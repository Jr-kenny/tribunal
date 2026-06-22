// Facet metadata for the UI. facet_id matches the ids the Tribunal contract is
// configured with (see judges/rubrics.py): authenticity=1, solvency=2 (critical),
// custodian=3, valuation=4.

export type FacetKey = "authenticity" | "solvency" | "custodian" | "valuation";

export interface Facet {
  key: FacetKey;
  id: number;
  name: string;
  question: string;
  fetches: string;
  critical: boolean;
  color: string;
  icon: string; // tabler icon name (rendered via the Icon component)
}

export const FACETS: Facet[] = [
  {
    key: "authenticity",
    id: 1,
    name: "Authenticity",
    question: "Is the document real?",
    fetches: "Fetches the attestation document and verifies its SHA-256",
    critical: false,
    color: "var(--judge-authenticity)",
    icon: "file-certificate",
  },
  {
    key: "solvency",
    id: 2,
    name: "Solvency",
    question: "Is the money actually there?",
    fetches: "Reads the reserve wallet's balance live off Casper",
    critical: true,
    color: "var(--judge-solvency)",
    icon: "shield-dollar",
  },
  {
    key: "custodian",
    id: 3,
    name: "Custodian",
    question: "Are they legit?",
    fetches: "Looks the custodian up in a public knowledge source",
    critical: false,
    color: "var(--judge-custodian)",
    icon: "building-bank",
  },
  {
    key: "valuation",
    id: 4,
    name: "Valuation",
    question: "Is it really worth that?",
    fetches: "Reads a live market price under consensus",
    critical: false,
    color: "var(--judge-valuation)",
    icon: "chart-line",
  },
];

export const facetByKey = (key: string): Facet | undefined => FACETS.find((f) => f.key === key);
