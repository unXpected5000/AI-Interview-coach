// Operator details for the legal pages come from build-time environment
// variables so no real identity, address, or contact is committed to source.
// Unset values render as a visible "not configured" marker.

const env = import.meta.env ?? {};

function value(name) {
  const raw = env[name];
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

export const LEGAL_EFFECTIVE_DATE = "14 November 2026";

export const legalConfig = {
  serviceName: value("VITE_LEGAL_SERVICE_NAME") || "AI Interview Coach",
  operatorName: value("VITE_LEGAL_OPERATOR_NAME"),
  contactEmail: value("VITE_LEGAL_CONTACT_EMAIL"),
  postalAddress: value("VITE_LEGAL_POSTAL_ADDRESS"),
  governingLaw: value("VITE_LEGAL_GOVERNING_LAW"),
  minimumAge: value("VITE_LEGAL_MINIMUM_AGE"),
  institution: value("VITE_LEGAL_INSTITUTION"),
};

export const LEGAL_ENV_VARIABLES = {
  operatorName: "VITE_LEGAL_OPERATOR_NAME",
  contactEmail: "VITE_LEGAL_CONTACT_EMAIL",
  postalAddress: "VITE_LEGAL_POSTAL_ADDRESS",
  governingLaw: "VITE_LEGAL_GOVERNING_LAW",
  minimumAge: "VITE_LEGAL_MINIMUM_AGE",
  institution: "VITE_LEGAL_INSTITUTION",
};

export function missingLegalSettings(config = legalConfig) {
  return Object.entries(LEGAL_ENV_VARIABLES)
    .filter(([key]) => key !== "institution" && !config[key])
    .map(([, name]) => name);
}

export function legalValue(key, config = legalConfig) {
  return config[key] || `[not configured: ${LEGAL_ENV_VARIABLES[key]}]`;
}
