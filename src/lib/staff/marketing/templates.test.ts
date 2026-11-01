import { describe, expect, it } from "vitest";
import { extractPlaceholders, firstName, renderTemplate, templateParameters, unknownPlaceholders } from "./templates";

describe("templates", () => {
  const body = "שלום {name}! ההזמנות נסגרות {deadline}. {name}, מחכים לך ב-{site}";
  it("extracts placeholders in order, once", () => {
    expect(extractPlaceholders(body)).toEqual(["name", "deadline", "site"]);
  });
  it("renders with fallbacks", () => {
    expect(renderTemplate("שלום {name}", { name: "  דנה " })).toBe("שלום דנה");
    expect(renderTemplate("שלום {name}", {})).toBe("שלום לקוח/ה יקר/ה");
    expect(renderTemplate("{foo} נשאר", {})).toBe("{foo} נשאר");
  });
  it("builds positional Meta parameters", () => {
    expect(templateParameters(body, { name: "דנה", deadline: "שלישי 12:00", site: "x.co.il" })).toEqual([
      "דנה",
      "שלישי 12:00",
      "x.co.il",
    ]);
  });
  it("flags unknown placeholders", () => {
    expect(unknownPlaceholders("hi {name} {phone}")).toEqual(["phone"]);
  });
  it("first name", () => {
    expect(firstName("  דנה  כהן ")).toBe("דנה");
    expect(firstName(null)).toBe("");
  });
});
