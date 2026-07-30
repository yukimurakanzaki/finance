export type Language = 'en' | 'id'

export interface Translations {
  // Common
  common: {
    save: string
    cancel: string
    delete: string
    edit: string
    done: string
    back: string
    next: string
    loading: string
    error: string
    retry: string
    confirm: string
    close: string
    add: string
    remove: string
    update: string
    yes: string
    no: string
  }
  
  // Navigation / Tabs
  nav: {
    home: string
    budget: string
    assets: string
    decide: string
    more: string
    chat: string
  }
  
  // Home Screen
  home: {
    title: string
    subtitle: string
    netWorth: string
    fiProjection: string
    pathA: string
    pathB: string
    monthsToFI: string
    yearsToFI: string
    yearsAway: string
    reachedFI: string
    notOnTrack: string
    goldStaleWarning: string
    savingsRate: string
    gapToLowTarget: string
    gapToHighTarget: string
    lanes: {
      income_producing: string
      store_of_value: string
      debt_liability: string
      protected_living: string
      pass_through: string
    }
  }
  
  // Budget Screen
  budget: {
    title: string
    subtitle: string
    safeToSpend: string
    todayCeiling: string
    weekPool: string
    monthPool: string
    yearPool: string
    spentThisWeek: string
    spentThisMonth: string
    spentThisYear: string
    remainingPool: string
    workdaysLeft: string
    daysLeft: string
    weekendAllocation: string
    negativePoolWarning: string
    weekendLabel: string
    weekendReset: string
    addTransaction: string
    reconcile: string
    viewAllTransactions: string
    transactionHistory: string
    monthlyWaterfall: string
    annualPicture: string
    annualTakeHome: string
    committed: string
    discretionary: string
    unallocated: string
    takeHomeNet: string
    payYourselfFirst: string
    billsAndSubs: string
    discretionaryPool: string
    monthlyAllowance: string
    recurringItemsEmpty: string
    perMonthShort: string
    perYearShort: string
    intoPipePerYear: string
    horizonWeekly: string
    horizonMonthly: string
    horizonYearly: string
    noTransactions: string
    setAllowancePrompt: string
    spent: string
    earned: string
  }
  
  // Assets Screen
  assets: {
    title: string
    subtitle: string
    addAccount: string
    addAsset: string
    accounts: string
    accountsCount: string
    assetsCount: string
    noAccounts: string
    noAssets: string
    refreshPrices: string
    refreshing: string
    lastRefreshed: string
    refreshError: string
    accountTypes: {
      bank: string
      brokerage: string
      crypto: string
      pension: string
      property: string
    }
  }
  
  // Decide Screen
  decide: {
    title: string
    subtitle: string
    comingSoon: string
    description: string
    spendingLens: string
    incomeLog: string
    milestones: string
  }
  
  // Chat Screen
  chat: {
    title: string
    subtitle: string
    placeholder: string
    signInPrompt: string
    signIn: string
    thinking: string
    error: string
  }
  
  // More Screen
  more: {
    title: string
    settings: string
    language: string
    languageDesc: string
    household: string
    export: string
    signOut: string
    version: string
    allowance: string
    recurringRegister: string
    pinLock: string
    pinLockSet: string
    pinLockNotSet: string
    fiAssumptions: string
    categories: string
    getClaudePrompt: string
    importTransactions: string
    exportBackup: string
    restoreBackup: string
    signOutManager: string
  }
  
  // Auth
  auth: {
    signIn: string
    signUp: string
    email: string
    password: string
    signInButton: string
    signUpButton: string
    signInError: string
    signUpError: string
    forgotPassword: string
    resetPassword: string
    checkEmail: string
    displayNameOptional: string
    passwordMin: string
    noAccountSignUp: string
    haveAccountSignIn: string
    nameHousehold: string
    joinHousehold: string
    signedInAsCreate: string
    signedInAsJoin: string
    householdName: string
    inviteCode: string
    createHousehold: string
    joinHouseholdButton: string
    haveInviteJoin: string
    startFreshCreate: string
    signOutButton: string
  }
  
  // Onboarding
  onboarding: {
    welcome: string
    getStarted: string
    step1Title: string
    step1Desc: string
    step2Title: string
    step2Desc: string
    step3Title: string
    step3Desc: string
    skip: string
    finish: string
  }
  
  // Reconcile
  reconcile: {
    title: string
    subtitle: string
    pasteJson: string
    import: string
    transfers: string
    duplicates: string
    invalid: string
    approve: string
    approveAll: string
    importing: string
    importSuccess: string
    importFailed: string
    reviewTransfers: string
    reviewDuplicates: string
    validRows: string
    invalidRows: string
  }
  
  // Forms
  forms: {
    accountName: string
    institution: string
    accountType: string
    balance: string
    assetName: string
    assetType: string
    value: string
    quantity: string
    notes: string
    required: string
    optional: string
  }
}
