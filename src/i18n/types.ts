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
    working: string
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

  // Navigation / Tabs. Keys mirror the `Tab` union in components/TabBar.tsx so
  // the tab bar can index this by tab id. `home` and `decide` are not tabs —
  // HomeScreen is embedded in the Report tab, DecideScreen in the More tab.
  nav: {
    today: string
    budget: string
    chat: string
    assets: string
    report: string
    more: string
    home: string
    decide: string
    primaryLandmark: string
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
    pipeVsNet: string
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
    personalSubscriptions: string
    subscriptions: string
    otherCommitted: string
    discretionaryPool: string
    monthlyAllowance: string
    recurringItemsEmpty: string
    perDayShort: string
    perMonthShort: string
    perYearShort: string
    leftSuffix: string
    workdayToGo: string
    workdaysToGo: string
    intoPipePerYear: string
    horizonWeekly: string
    horizonMonthly: string
    horizonYearly: string
    noTransactions: string
    setAllowanceTitle: string
    setAllowancePrompt: string
    spent: string
    earned: string
    // Keys mirror the `Cadence` union in db/types.ts.
    cadences: {
      monthly: string
      weekly: string
      yearly: string
      one_off: string
    }
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
    totalBalance: string
    noAccounts: string
    noAssets: string
    noAssetsHint: string
    refreshPrices: string
    refreshing: string
    lastRefreshed: string
    refreshError: string
    pricesRefreshedAt: string
    pricesNotFetched: string
    autoBadge: string
    priceStale: string
    // Keys mirror the `AccountType` union in db/types.ts.
    accountTypes: {
      bank: string
      digital_wallet: string
      cash: string
    }
    // T3 / FR-3.5. `overdrawnSince` takes the date the balance crossed zero;
    // `overdrawn` is the dateless fallback when the crossing predates the ledger.
    overdrawn: string
    overdrawnSince: (date: string) => string
    // Keys mirror the `AssetType` union in db/types.ts.
    assetTypes: {
      investment_rdpu: string
      investment_equity: string
      gold: string
      dplk: string
      storyforge: string
      currency: string
      other: string
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
    appearance: string
    theme: string
    themeLight: string
    themeDark: string
    themeCaption: string
    language: string
    languageDesc: string
    financialSetup: string
    household: string
    export: string
    signOut: string
    version: string
    allowance: string
    allowanceCaption: string
    recurringRegister: string
    recurringRegisterCaption: string
    pinLock: string
    pinLockSet: string
    pinLockNotSet: string
    pinLockedCaption: string
    pinNotLockedCaption: string
    fiAssumptions: string
    fiAssumptionsCaption: string
    categories: string
    categoriesCaption: string
    income: string
    logIncome: string
    logIncomeCaption: string
    plan: string
    decideCaption: string
    membersInvites: string
    membersInvitesCaption: string
    data: string
    logViaManager: string
    logViaManagerCaption: string
    getClaudePrompt: string
    importTransactions: string
    importTransactionsCaption: string
    advancedImport: string
    advancedImportCaption: string
    exportBackup: string
    exportBackupCaption: string
    restoreBackup: string
    restoreBackupCaption: string
    signOutManager: string
    signOutCaption: string
    signOutConfirm: string
    signedOutAlert: string
    footer: string
  }

  // Auth
  auth: {
    signIn: string
    signUp: string
    signInSubtitle: string
    signUpSubtitle: string
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
    stepOfTotal: string
    chooseTitle: string
    chooseSub: string
    quickSetupTitle: string
    quickSetupBadge: string
    quickSetupDesc: string
    fullSetupTitle: string
    fullSetupDesc: string
    changeSetupType: string
    firstAccountTitle: string
    firstAccountSubQuick: string
    firstAccountSubFull: string
    bankAccountOption: string
    digitalWalletOption: string
    cashOption: string
    currentBalanceRp: string
    balanceOptionalNote: string
    addLaterNote: string
    incomeTitle: string
    incomeSub: string
    grossSalaryMonthly: string
    takeHomeNetMonthlyRequired: string
    takeHomeExplainer: string
    pipeDplkTitle: string
    pipeDplkSub: string
    pipeNameLabel: string
    monthlyRp: string
    addPipe: string
    dplkMonthlyOptional: string
    principle6: string
    allowanceTitle: string
    allowanceSub: string
    monthlyPersonalPoolRequired: string
    weekendAllocationMonthly: string
    weekendExplainer: string
    continueButton: string
    finishSetup: string
    finishQuickSetup: string
  }

  // Reconcile
  reconcile: {
    title: string
    subtitle: string
    pasteJson: string
    import: string
    transfers: string
    transferSingular: string
    duplicates: string
    invalid: string
    approve: string
    approveAll: string
    approveAllCount: string
    approvePartial: string
    importing: string
    importSuccess: string
    importFailed: string
    reviewTransfers: string
    reviewDuplicates: string
    validRows: string
    invalidRows: string
    transactionsCount: string
    autoCollapsedTransfers: string
    invalidRowsCount: string
    includeRow: string
    excludeRow: string
    skipped: string
    rowLabel: string
    recurringNotTagged: string
    recurringTagged: string
    recurringSuggestTitle: string
    recurringTaggedTitle: string
  }

  // Forms
  forms: {
    accountName: string
    institution: string
    accountType: string
    balance: string
    currentBalanceLabel: string
    grossSalaryLabel: string
    pipeLabel: string
    monthlyPoolLabel: string
    assetName: string
    assetType: string
    value: string
    quantity: string
    notes: string
    required: string
    optional: string
    // Prefix for illustrative placeholder values, e.g. `${egPrefix}BCA Tabungan`.
    egPrefix: string
    checkAmountsError: string
  }
}
