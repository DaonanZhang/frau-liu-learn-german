const MAX_ERRORS = 20;
const MAX_VALUE_LENGTH = 2000;
const errorBuffer = [];

function truncate(value) {
  return String(value || "").slice(0, MAX_VALUE_LENGTH);
}

function serializeValue(value) {
  if (value instanceof Error) {
    return truncate(value.stack || `${value.name}: ${value.message}`);
  }

  if (typeof value === "string") {
    return truncate(value);
  }

  try {
    return truncate(JSON.stringify(value));
  } catch {
    return truncate(value);
  }
}

function capture(type, values) {
  errorBuffer.push({
    type,
    message: values.map(serializeValue).join(" "),
    occurred_at: new Date().toISOString(),
    page_url: window.location.href,
  });

  if (errorBuffer.length > MAX_ERRORS) {
    errorBuffer.splice(0, errorBuffer.length - MAX_ERRORS);
  }
}

if (typeof window !== "undefined" && !window.__frauLiuErrorCaptureInstalled) {
  window.__frauLiuErrorCaptureInstalled = true;

  const originalConsoleError = console.error.bind(console);
  console.error = (...values) => {
    capture("console.error", values);
    originalConsoleError(...values);
  };

  window.addEventListener("error", (event) => {
    capture("window.error", [event.error || event.message]);
  });

  window.addEventListener("unhandledrejection", (event) => {
    capture("unhandledrejection", [event.reason]);
  });
}

export function getCapturedClientErrors() {
  return errorBuffer.map((item) => ({ ...item }));
}
