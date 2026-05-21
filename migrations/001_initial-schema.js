exports.up = (pgm) => {
  pgm.createTable('workspaces', {
    id: { type: 'text', primaryKey: true },
    bot_user_id: { type: 'text' },
    bot_token: { type: 'text' },
    installed_at: { type: 'timestamp' }
  }, { ifNotExists: true });

  pgm.createTable('workspace_subscriptions', {
    workspace_id: { type: 'text', primaryKey: true },
    record: { type: 'jsonb', notNull: true }
  }, { ifNotExists: true });

  pgm.createTable('config', {
    workspace_id: { type: 'text', notNull: true },
    key: { type: 'text', notNull: true },
    value: { type: 'jsonb', notNull: true }
  }, {
    ifNotExists: true,
    constraints: {
      primaryKey: ['workspace_id', 'key']
    }
  });

  pgm.createTable('users', {
    workspace_id: { type: 'text', notNull: true },
    user_id: { type: 'text', notNull: true },
    record: { type: 'jsonb', notNull: true }
  }, {
    ifNotExists: true,
    constraints: {
      primaryKey: ['workspace_id', 'user_id']
    }
  });
};

exports.down = (pgm) => {
  pgm.dropTable('users');
  pgm.dropTable('config');
  pgm.dropTable('workspace_subscriptions');
  pgm.dropTable('workspaces');
};
