import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { resolveEmailTemplatesPath } from './resolve-templates-path';

let partialsRegistered = false;
const cache = new Map<string, HandlebarsTemplateDelegate>();

function registerPartials(templatesRoot: string): void {
  if (partialsRegistered) return;

  const partialsDir = path.join(templatesRoot, 'partials');
  if (!fs.existsSync(partialsDir)) {
    partialsRegistered = true;
    return;
  }

  for (const file of fs.readdirSync(partialsDir)) {
    if (!file.endsWith('.hbs')) continue;
    const name = path.basename(file, '.hbs');
    const source = fs.readFileSync(path.join(partialsDir, file), 'utf8');
    Handlebars.registerPartial(name, source);
  }

  partialsRegistered = true;
}

/**
 * Compila un template por nombre (`registration-welcome` → `registration-welcome.hbs`).
 * Registra partials de `templates/partials/` la primera vez.
 */
export function compileEmailTemplate(templateName: string): HandlebarsTemplateDelegate {
  const cached = cache.get(templateName);
  if (cached) return cached;

  const templatesRoot = resolveEmailTemplatesPath();
  registerPartials(templatesRoot);

  const templatePath = path.join(templatesRoot, `${templateName}.hbs`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Email template not found: ${templateName} (${templatePath})`);
  }

  const compiled = Handlebars.compile(fs.readFileSync(templatePath, 'utf8'));
  cache.set(templateName, compiled);
  return compiled;
}

export function renderEmailTemplate(templateName: string, data: Record<string, unknown>): string {
  return compileEmailTemplate(templateName)(data);
}
