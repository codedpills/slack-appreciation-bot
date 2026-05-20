exports.up = (pgm) => {
  pgm.createTable('audit_log', {
    id: { type: 'serial', primaryKey: true },
    workspace_id: { type: 'text', notNull: true },
    actor_id: { type: 'text', notNull: true },
    action: { type: 'text', notNull: true },
    target_id: { type: 'text' },
    details: { type: 'jsonb' },
    created_at: { type: 'timestamp', default: pgm.func('NOW()') }
  });

  pgm.createIndex('audit_log', 'workspace_id', { name: 'idx_audit_log_workspace' });
  pgm.createIndex('audit_log', ['workspace_id', 'actor_id'], { name: 'idx_audit_log_actor' });
};

exports.down = (pgm) => {
  pgm.dropTable('audit_log');
};
