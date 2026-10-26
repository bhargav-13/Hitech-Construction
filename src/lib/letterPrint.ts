import { renderLetterPdf } from "./docPdf";
import { getTemplate, type DocTemplate } from "./docTemplates";
import { fillLetter, letterDef, type LetterKind } from "./letters";

/**
 * Fill a letter's saved wording (Templates → Payroll) with one employee's values and draw it.
 * `subject` / `body` override the template for this one letter — the generate screen lets HR
 * adjust a sentence without touching the company's template.
 */
export async function printLetter(
  kind: LetterKind,
  values: Record<string, string>,
  opts: { template?: DocTemplate; subject?: string; body?: string; save?: boolean } = {},
) {
  const tpl = opts.template ?? (await getTemplate(kind));
  const def = letterDef(kind);
  return renderLetterPdf(
    {
      kind,
      subject: fillLetter(opts.subject ?? tpl.subject, values),
      body: fillLetter(opts.body ?? tpl.body, values),
      date: values.date ?? "",
      refNo: values.refNo || null,
      to: def.addressed ? [values.name, values.designation, values.address].filter((x): x is string => !!x?.trim()) : [],
      acceptanceBy: def.acceptance ? values.name || null : null,
      fileName: `${def.label}-${values.name || "employee"}`,
    },
    { template: tpl, save: opts.save },
  );
}
