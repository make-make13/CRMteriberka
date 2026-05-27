export interface PdfmeSchemaNameLike {
  name?: unknown;
  crmVariable?: unknown;
}

export function getPdfmeSchemaValueKey(schema: PdfmeSchemaNameLike) {
  return typeof schema.crmVariable === 'string' && schema.crmVariable
    ? schema.crmVariable
    : typeof schema.name === 'string'
      ? schema.name
      : '';
}

export function createPdfmeVariableFieldName(schemas: PdfmeSchemaNameLike[], variableName: string) {
  const existingNames = new Set(
    schemas
      .map(schema => schema.name)
      .filter((name): name is string => typeof name === 'string')
  );

  if (!existingNames.has(variableName)) return variableName;

  let index = 2;
  let nextName = `${variableName}__copy_${index}`;
  while (existingNames.has(nextName)) {
    index += 1;
    nextName = `${variableName}__copy_${index}`;
  }
  return nextName;
}
