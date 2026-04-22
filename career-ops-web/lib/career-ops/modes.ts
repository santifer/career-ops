export type CareerOpsModeId =
  | "auto-pipeline"
  | "pipeline"
  | "oferta"
  | "ofertas"
  | "contacto"
  | "deep"
  | "pdf"
  | "training"
  | "project"
  | "tracker"
  | "apply"
  | "scan"
  | "batch";

export interface CareerOpsModeDefinition {
  id: CareerOpsModeId;
  label: string;
  description: string;
  usesSharedContext: boolean;
  prefersSubagent: boolean;
  cli: string;
}

export const CAREER_OPS_MODES: CareerOpsModeDefinition[] = [
  {
    id: "auto-pipeline",
    label: "Auto-pipeline",
    description:
      "Paste a JD URL or text: evaluate, report, PDF, tracker — full pipeline.",
    usesSharedContext: true,
    prefersSubagent: true,
    cli: "/career-ops",
  },
  {
    id: "pipeline",
    label: "Pipeline",
    description: "Process pending URLs from your pipeline inbox.",
    usesSharedContext: true,
    prefersSubagent: true,
    cli: "/career-ops pipeline",
  },
  {
    id: "oferta",
    label: "Oferta",
    description: "Evaluate a single offer A–F (no auto PDF).",
    usesSharedContext: true,
    prefersSubagent: false,
    cli: "/career-ops oferta",
  },
  {
    id: "ofertas",
    label: "Ofertas",
    description: "Compare and rank multiple offers.",
    usesSharedContext: true,
    prefersSubagent: false,
    cli: "/career-ops ofertas",
  },
  {
    id: "contacto",
    label: "Contacto",
    description: "LinkedIn: find contacts and draft a message.",
    usesSharedContext: true,
    prefersSubagent: false,
    cli: "/career-ops contacto",
  },
  {
    id: "deep",
    label: "Deep research",
    description: "Deep research prompt about a company.",
    usesSharedContext: false,
    prefersSubagent: false,
    cli: "/career-ops deep",
  },
  {
    id: "pdf",
    label: "PDF only",
    description: "ATS-optimized CV PDF only.",
    usesSharedContext: true,
    prefersSubagent: false,
    cli: "/career-ops pdf",
  },
  {
    id: "training",
    label: "Training",
    description: "Evaluate a course or cert against your North Star.",
    usesSharedContext: false,
    prefersSubagent: false,
    cli: "/career-ops training",
  },
  {
    id: "project",
    label: "Project",
    description: "Evaluate a portfolio project idea.",
    usesSharedContext: false,
    prefersSubagent: false,
    cli: "/career-ops project",
  },
  {
    id: "tracker",
    label: "Tracker",
    description: "Application status overview.",
    usesSharedContext: false,
    prefersSubagent: false,
    cli: "/career-ops tracker",
  },
  {
    id: "apply",
    label: "Apply",
    description:
      "Live application assistant — reads the form and generates answers.",
    usesSharedContext: true,
    prefersSubagent: true,
    cli: "/career-ops apply",
  },
  {
    id: "scan",
    label: "Scan",
    description: "Scan portals and discover new offers.",
    usesSharedContext: true,
    prefersSubagent: true,
    cli: "/career-ops scan",
  },
  {
    id: "batch",
    label: "Batch",
    description: "Batch processing with parallel workers / conductor.",
    usesSharedContext: true,
    prefersSubagent: true,
    cli: "/career-ops batch",
  },
];

const byId = new Map(CAREER_OPS_MODES.map((mode) => [mode.id, mode]));

export function getModeDefinition(id: string): CareerOpsModeDefinition | undefined {
  return byId.get(id as CareerOpsModeId);
}

export function isCareerOpsModeId(id: string): id is CareerOpsModeId {
  return byId.has(id as CareerOpsModeId);
}
