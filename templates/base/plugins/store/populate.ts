//stackpress
import type { ProfileAuth } from 'stackpress';
import { action } from 'stackpress/server';

const secret = process.env.ADMIN_PASS || 'Admin123!';

export default action(async function Populate({ ctx }) {
  //Presets without authentication do not need a seeded admin account.
  if (!ctx.config.get('auth')) return;

  try {
    const admin = await ctx.resolve<ProfileAuth>('auth-signup', {
      type: 'person',
      name: 'Admin',
      username: 'admin',
      email: 'admin@project.com',
      //stackpress-session normalizePhone expects a string
      phone: '',
      secret,
      roles: [ 'ADMIN' ]
    });
    if (admin.code !== 200) {
      console.log('Error creating admin user', admin);
      return;
    }
    await ctx.resolve('application-create', {
      profileId: admin.results?.id,
      name: '{{name}} App',
      scopes: [ 'profile-write', 'auth-read' ],
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
    });
  } catch (error) {
    console.log(
      'Populate skipped:',
      error instanceof Error ? error.message : String(error)
    );
  }
});
