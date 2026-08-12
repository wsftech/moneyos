use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_transferencias_vinculadas",
            sql: include_str!("../migrations/002_transferencias_vinculadas.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_conta_icone",
            sql: include_str!("../migrations/003_conta_icone.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_financiamentos",
            sql: include_str!("../migrations/004_financiamentos.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "fix_valor_total_financiamentos",
            sql: include_str!("../migrations/005_fix_valor_total_financiamentos.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "financiamento_previsto_referencia",
            sql: include_str!("../migrations/006_financiamento_previsto_referencia.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add_emprestimos",
            sql: include_str!("../migrations/007_emprestimos.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "orcamento_recorrentes",
            sql: include_str!("../migrations/008_orcamento_recorrentes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "orcamento_recorrentes_indices",
            sql: include_str!("../migrations/009_orcamento_recorrentes_indices.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "contas_pagar_receber_categoria",
            sql: include_str!("../migrations/010_contas_pagar_receber_categoria.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "fase2_recorrentes_cartao",
            sql: include_str!("../migrations/011_fase2_recorrentes_cartao.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "fase3_metas_regras",
            sql: include_str!("../migrations/012_fase3_metas_regras.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "fase4_cartao_completo",
            sql: include_str!("../migrations/013_fase4_cartao_completo.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "tags_saldo_data",
            sql: include_str!("../migrations/014_tags_saldo_data.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "parcelamento_contatos",
            sql: include_str!("../migrations/015_parcelamento_contatos.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "conta_logo",
            sql: include_str!("../migrations/016_conta_logo.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
