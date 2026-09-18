export const Messages = {
  USER_CREATED: 'User created and demo CarbonTrack session opened',
  USER_LOGIN_OK: 'User login accepted',
  USER_PROFILE_UPDATED: 'User profile saved',
  ACTIVITY_CREATED: 'Activity carbon value calculated and stored',
  ACTIVITY_UPDATED: 'Activity carbon record updated',
  ACTIVITY_DELETED: 'Activity removed from carbon ledger',
  GOAL_CREATED: 'Goal created and progress linked to activities',
  GOAL_UPDATED: 'Goal status updated',
  FACTOR_CREATED: 'Carbon factor stored for region matching',
  QUOTA_CONFIGURED: 'Region monthly emission quota stored and ledger attached',
  QUOTA_REJECTED: 'Region monthly emission quota exceeded, whole write rejected',
  QUOTA_RELEASED: 'Region monthly emission quota released with activity removal',
  AUDIT_LOGGED: 'Audit log captured',
  BACKEND_SHARED: 'Shared backend/frontend copy used by coupled message constants'
} as const;
