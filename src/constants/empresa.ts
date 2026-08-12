/** Dados legais da empresa — uso em Sobre, rodapés e metadados do bundle. */
export const EMPRESA = {
  razaoSocial: "WSF tecnologia Ltda",
  nomeFantasia: "WSF Money",
  cnpj: "54.492.026/0001-23",
  cnpjNumeros: "54492026000123",
  anoCopyright: 2026,
} as const;

export const COPYRIGHT_LINHA = `Copyright © ${EMPRESA.anoCopyright} ${EMPRESA.razaoSocial}`;

export const COPYRIGHT_COM_CNPJ = `${COPYRIGHT_LINHA} · CNPJ ${EMPRESA.cnpj}`;
