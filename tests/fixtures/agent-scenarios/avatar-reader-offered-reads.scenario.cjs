'use strict';

/**
 * A «Пользователь» reads avatars but is offered nothing that creates,
 * changes, analyses or deletes one (spec §4.2; kcxz.18 acceptance).
 */
module.exports = {
  id: 'avatar-reader-offered-reads',
  title: 'Пользователь — аватары только на чтение',
  role: 'USER',
  covers: ['avatar.overview'],
  turns: [
    {
      say: 'Где наш аватар?',
      model: [[['tool', 'avatar_overview', {}]], [['text', 'Аватар разобран, голос ещё не включён.']]],
    },
  ],
  check: (run) => {
    const offered = run.firstCall.tools;
    expect(offered).toEqual(
      expect.arrayContaining(['avatar_list', 'avatar_overview', 'avatar_proposal', 'avatar_manual', 'avatar_samples', 'avatar_learning'])
    );
    for (const tool of [
      'avatar_create',
      'avatar_rename',
      'avatar_default',
      'avatar_bind',
      'avatar_samples_add',
      'avatar_proposal_field',
      'avatar_manual_field',
      'avatar_analyse',
      'avatar_learn',
      'avatar_activate',
      'avatar_samples_delete',
      'avatar_delete',
      'avatar_rule_forget',
      'avatar_retire',
    ]) {
      expect(offered).not.toContain(tool);
    }
    expect(run.turns[0].outputs[0].output).toMatchObject({ ok: true, summary: { canManage: false } });
    expect(run.writes).toEqual([]);
  },
};
