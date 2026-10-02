export const PERMISSIONS = [
  'platform.manage', 'dashboard.read', 'audit.read',
  'users.read', 'users.manage', 'roles.manage',
  'vendors.read', 'vendors.manage', 'vendors.approve',
  'categories.manage',
  'catalog.read', 'catalog.create', 'catalog.update', 'catalog.delete', 'catalog.publish',
  'inventory.read', 'inventory.manage',
  'orders.read', 'orders.manage', 'orders.refund',
  'customers.read', 'customers.manage',
  'cms.read', 'cms.create', 'cms.update', 'cms.delete', 'cms.publish',
  'posts.read', 'posts.create', 'posts.update', 'posts.delete', 'posts.publish',
  'journal.read', 'journal.create', 'journal.update', 'journal.delete', 'journal.publish',
  'media.read', 'media.upload', 'media.manage',
  'editor.read', 'editor.manage', 'editor.publish',
  'seo.read', 'seo.manage', 'seo.audit',
  'campaigns.read', 'campaigns.manage',
  'coupons.read', 'coupons.manage',
  'qr.read', 'qr.manage', 'qr.analytics',
  'loyalty.read', 'loyalty.manage',
  'classifieds.read', 'classifieds.create', 'classifieds.update', 'classifieds.delete', 'classifieds.moderate',
  'service_categories.manage',
  'analytics.read', 'analytics.export',
  'settings.read', 'settings.manage'
] as const;

export type Permission = typeof PERMISSIONS[number];

export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  admin: PERMISSIONS.filter((permission) => permission !== 'platform.manage'),
  editor: ['dashboard.read', 'cms.read', 'cms.create', 'cms.update', 'cms.publish', 'posts.read', 'posts.create', 'posts.update', 'posts.publish', 'journal.read', 'journal.create', 'journal.update', 'journal.publish', 'media.read', 'media.upload', 'media.manage', 'editor.read', 'editor.manage', 'editor.publish', 'seo.read', 'classifieds.read', 'classifieds.create', 'classifieds.update', 'classifieds.delete', 'service_categories.manage'],
  seo: ['dashboard.read', 'cms.read', 'cms.update', 'posts.read', 'posts.update', 'seo.read', 'seo.manage', 'seo.audit', 'analytics.read'],
  moderator: [
    'catalog.read', 'catalog.create', 'catalog.update', 'catalog.delete', 'catalog.publish',
    'inventory.read', 'inventory.manage',
    'posts.read', 'posts.create', 'posts.update', 'posts.delete', 'posts.publish',
    'journal.read', 'journal.create', 'journal.update', 'journal.delete', 'journal.publish',
    'media.read', 'media.upload'
  ],
  vendor_owner: [
    'dashboard.read', 'catalog.read', 'catalog.create', 'catalog.update', 'catalog.delete',
    'inventory.read', 'inventory.manage', 'orders.read', 'orders.manage',
    'campaigns.read', 'campaigns.manage', 'coupons.read', 'coupons.manage',
    'qr.read', 'qr.manage', 'qr.analytics', 'analytics.read', 'media.read', 'media.upload', 'media.manage', 'loyalty.read', 'loyalty.manage',
    'classifieds.read', 'classifieds.create', 'classifieds.update', 'classifieds.delete'
  ],
  vendor_staff: ['dashboard.read', 'catalog.read', 'catalog.create', 'catalog.update', 'inventory.read', 'inventory.manage', 'orders.read', 'orders.manage', 'media.read', 'media.upload', 'media.manage', 'loyalty.read', 'classifieds.read', 'classifieds.create', 'classifieds.update', 'classifieds.delete'],
  customer: []
};
