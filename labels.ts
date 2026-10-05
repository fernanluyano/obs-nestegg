// English only.
const strings = {
    'label.type.expense': 'Expense',
    'label.type.income': 'Income',
    'label.type.transfer': 'Transfer',

    'label.accountType.cash': 'Cash',
    'label.accountType.creditCard': 'Credit Card',

    'label.cat.other': 'Other',

    'ui.addTransaction': 'Add transaction',
    'ui.detail': 'Transactions',
    'ui.confirm': 'Confirm',
    'ui.cancel': 'Cancel',
    'ui.delete': 'Delete',
    'ui.edit': 'Edit',
    'ui.rename': 'Rename',
    'ui.archive': 'Archive',
    'ui.unarchive': 'Unarchive',
    'ui.save': 'Save',
    'ui.search': 'Search',
    'ui.noMatches': 'No matches',

    'dashboard.title': 'Finance overview',
    'dash.income': 'Income',
    'dash.expense': 'Expense',
    'dash.balance': 'Balance',
    'dash.netAsset': 'Net assets',
    'dash.accountBalances': 'Account balances',
    'dash.assetAllocation': 'Asset allocation',
    'dash.expenseByCategory': 'Expense by category',
    'dash.incomeByCategory': 'Income by category',
    'dash.noData': 'No data this month',

    'detail.title': 'Transactions',
    'detail.filterAll': 'All',
    'detail.filterExpense': 'Expense',
    'detail.filterIncome': 'Income',
    'detail.filterTransfer': 'Transfer',
    'detail.subtotalIncome': 'Income subtotal',
    'detail.subtotalExpense': 'Expense subtotal',
    'detail.noTransactions': 'No matching transactions',    'detail.searchPlaceholder': 'Search merchant, note or tags...',
    'detail.filterCategory': 'Category',
    'detail.filterButton': 'Filter',
    'detail.filterTitle': 'Filter',
    'detail.filterType': 'Type',
    'detail.filterAccount': 'Account',
    'detail.filterAllAccounts': 'All accounts',
    'detail.filterDateRange': 'Date range',
    'detail.filterClearAll': 'Clear all',
    'detail.filterDone': 'Done',

    'trend.3m': '3 Months',
    'trend.6m': '6 Months',
    'trend.12m': '12 Months',
    'trend.monthlyIncomeExpense': 'Monthly income & expense',

    'modal.addTitle': 'Add transaction',
    'modal.editTitle': 'Edit transaction',
    'modal.date': 'Date',
    'modal.account': 'Account',
    'modal.fromAccount': 'From account',
    'modal.toAccount': 'To account',
    'modal.subcategory': 'Category',
    'modal.merchant': 'Merchant',
    'modal.note': 'Note',
    'modal.tags': 'Tags',
    'modal.tagsPlaceholder': 'Type and press Enter',
    'modal.done': 'Done',
    'tagPicker.title': 'Select tags',
    'tagPicker.search': 'Search or type a new tag',
    'tagPicker.addTag': '+ Add tag',
    'tagPicker.addNamed': '+ Add "{name}"',
    'tagPicker.noResults': 'No tags containing "{searchTerm}"',
    'tagPicker.tagLimit': 'Tag limit reached',
    'tagPicker.tooLong': 'Too long to add (max 16 characters)',
    'tagPicker.rowPlaceholder': 'Select tags',
    'modal.amount': 'Amount',
    'modal.isRefund': 'This is a refund',
    'modal.isRefund.hint': 'Stored as money coming back under an expense category (for refunds and returns)',

    'err.amountRequired': 'Amount is required',
    'err.amountPositive': 'Amount must be greater than 0',
    'err.amountInvalid': 'Enter a valid amount with at most 2 decimals',
    'err.accountRequired': 'Please select an account',
    'err.fromAccountRequired': 'Please select source account',
    'err.toAccountRequired': 'Please select target account',
    'err.sameAccount': 'Source and target accounts cannot be the same',
    'err.subcategoryRequired': 'Please select a category',
    'err.subcategoryUnknown': 'That category no longer exists',
    'err.subcategoryWrongType': 'That category does not match the transaction type',
    'err.accountNameEmpty': 'Account name cannot be empty',
    'err.invalidDate': 'Invalid date',
    'err.fromMustNotBeCreditCard': 'Source account cannot be a credit card',
    'err.toMustBeCreditCard': 'Target account must be a credit card',
    'err.invalidName': 'Names cannot be empty or contain / \\ : * ? " < > | # ^ [ ]',
    'err.balanceNegative': 'Enter a positive amount',
    'err.tagTooLong': 'Tag is too long (max 16 characters)',
    'err.tagInvalid': 'Tags can only contain letters, numbers and dashes',
    'err.balanceRequired': 'Enter the current balance. Zero is fine, but it cannot be left blank.',

    'calculator.err.pendingExpression': 'Press = to finish the calculation',
    'calculator.err.negativeResult': 'Calculation result cannot be negative',
    'calculator.err.divideByZero': 'Cannot divide by 0',
    'calculator.done': 'Done',

    'settings.defaultAccount': 'Default account',
    'settings.defaultAccountDesc': 'Default account selected when adding a transaction',
    'settings.activeAccounts': 'Active accounts',
    'settings.archivedAccounts': 'Archived accounts',
    'settings.addAccount': 'Add account',
    'settings.accountName': 'Name',
    'settings.accountType': 'Type',
    'settings.enteredBalance': 'Balance',
    'settings.enteredBalanceAsOf': 'Balance as of',
    'settings.accountColor': 'Color',
    'settings.includeInNetAssetOn': 'Current: included in net assets',
    'settings.includeInNetAssetOff': 'Current: excluded from net assets',
    'settings.noActiveAccounts': 'No active accounts',
    'settings.creditDebtPrefix': 'Owed ',
    'settings.creditBalanceHint': 'Enter the outstanding debt as a positive amount, e.g. owe 3,000 → enter 3000',
    'settings.cashBalanceHint': 'Enter the actual balance on the date below. Transactions dated after it adjust the current balance.',
    'settings.expenseCategories': 'Expense',
    'settings.incomeCategories': 'Income',
    'settings.transferCategories': 'Transfer',
    'settings.addCategory': 'Add category',
    'settings.categoryPlaceholder': 'Category name',
    'settings.subcategoryPlaceholder': 'New subcategory',
    'settings.addSubcategory': 'Add',
    'settings.autoValidate': 'Validate data on startup',
    'settings.autoValidateDesc': 'Scan all notes when Obsidian loads to detect totals mismatches, orphaned accounts and unreadable rows',

    'prompt.renameCategory': 'Rename category (its Misc subcategory is renamed too)',
    'prompt.renameSubcategory': 'Rename subcategory',

    'validation.modalTitle': 'Data validation report',
    'validation.fixAll': 'Fix all',
    'validation.repaired': 'Fixed {count} issue(s)',
    'validation.section.monthTotals': 'Month totals out of date',
    'validation.section.accountBalance': 'Account balances out of date',
    'validation.section.malformedRow': 'Unreadable rows',
    'validation.section.orphanedAccount': 'Transactions without an account',
    'validation.section.duplicateName': 'Duplicate names',
    'validation.section.duplicateMonth': 'Duplicate month files',
    'validation.section.duplicateSubcategory': 'Duplicate subcategories',
    'validation.section.unknownSubcategory': 'Unknown subcategories',
    'validation.section.transfer': 'Transfer problems',
    'validation.section.pathMismatch': 'Notes in unexpected places',
    'validation.section.inTransit': 'Unfinished changes',
    'validation.section.invalidNote': 'Notes that could not be read',
    'validation.section.invalidDefaultAccount': 'Default account',
    'validation.desc.monthTotals': '{account} {month}: income should be {actualIncome} (stored: {storedIncome}), expense should be {actualExpense} (stored: {storedExpense})',
    'validation.desc.accountBalance': '{account}: balance should be {actual} (stored: {stored})',
    'validation.desc.malformedRow': '{file}, line {line}: {reason}',
    'validation.desc.orphanedAccount': 'No account note for "{account}" — {count} transaction(s) in {months}',
    'validation.desc.duplicateName': 'Two or more {kind} notes are named "{name}": {paths}',
    'validation.desc.duplicateMonth': '{account} has more than one file for {month}: {paths}',
    'validation.desc.duplicateSubcategory': 'Subcategory "{subcategory}" appears in: {categories}',
    'validation.desc.unknownSubcategory': 'No category lists "{subcategory}" — {count} transaction(s) in {months}',
    'validation.desc.transfer.noPartner': '{account}, {date}: transfer of {amount} to/from {other} has no matching row on the other side',
    'validation.desc.transfer.missingFromTo': '{account}, {date}: transfer row has no FromTo account',
    'validation.desc.transfer.sameAccount': '{account}, {date}: transfer row points at its own account',
    'validation.desc.transfer.fromToOnNonTransfer': '{account}, {date}: FromTo is set on a row that is not a transfer',
    'validation.desc.pathMismatch': '{path} should be at {expected}',
    'validation.desc.inTransit': '{path} is left over from an interrupted change',
    'validation.desc.invalidNote': '{path}: {reason}',
    'validation.desc.invalidDefaultAccount': 'The default account "{name}" is missing or archived',
    'validation.fix.recalculate': 'Recalculate',
    'validation.fix.createAccount': 'Create archived account',
    'validation.fix.useFirstAccount': 'Use first account',
    'validation.fix.move': 'Move note',
    'validation.fix.promote': 'Promote',
    'validation.fix.discard': 'Discard',
    'notice.validationClean': 'Validation complete — data looks good.',
    'notice.fixFailed': 'Could not apply the fix: {reason}',

    'confirm.deleteTransaction': 'Delete this transaction? This cannot be undone.',
    'confirm.deleteTransfer': 'Delete this transfer? Both rows (one in each account) are removed.',
    'confirm.unarchiveAccount': 'Unarchive this account?',
    'confirm.deleteCategory': 'Delete this category?',
    'confirm.deleteSubcategory': 'Delete this subcategory?',

    'notice.accountAdded': '✓ Account "{name}" added',
    'notice.categoryAdded': '✓ Category "{name}" added',
    'notice.renamed': '✓ Renamed',
    'notice.transactionDeleted': '✓ Transaction deleted',
    'notice.transactionAdded': '✓ Transaction added',
    'notice.transactionUpdated': '✓ Transaction updated',
    'notice.loadFailed': 'Nestegg failed to load. Please check the notes in the Nestegg folder.',
    'notice.actionFailed': 'Failed: {reason}',

    'ui.setup': 'Set up',
    'wizard.stepOf': 'Step {n} of {total}',
    'wizard.back': 'Back',
    'wizard.next': 'Next',
    'wizard.finish': 'Finish',
    'wizard.welcome.title': 'Welcome',
    'wizard.accounts.title': 'Accounts',
    'wizard.categories.title': 'Categories',
    'wizard.general.title': 'Preferences',
    'wizard.done.title': 'All set',
    'wizard.welcome.intro': 'This wizard sets up your accounts and categories. You can reopen it any time from the command palette ("Set up accounts and categories") or the Set up button.',
    'wizard.welcome.required': 'You need at least one cash account, and categories that each hold at least one subcategory. Everything else is optional.',
    'wizard.accounts.intro': 'Your main account must be a cash account (checking, savings or cash on hand). Credit cards can be added too, but not instead of it.',
    'wizard.accounts.editHint': 'Changing the balance or its date does not remove transactions: those dated after the balance date adjust the current balance.',
    'wizard.categories.intro': 'Categories group your subcategories, and a transaction stores only the subcategory. Every category keeps a Misc subcategory, so none is ever empty.',
    'wizard.categories.rewriteWarning': 'Renaming a category or subcategory rewrites your notes and remaps every transaction that uses it. Nothing is lost, but it touches many files.',
    'wizard.needCashAccount': 'Add at least one cash account to continue.',
    'wizard.lastCashAccount': 'This is your last active cash account. Add another cash account before archiving or deleting it.',
    'wizard.needCategory': 'Add at least one category to continue.',
    'wizard.emptyCategory': 'The category "{name}" has no subcategories. Add a subcategory or remove the category.',
    'wizard.needDefaultCash': 'Choose an active cash account as your default account.',
    'wizard.confirm.renameAccount': 'Rename "{from}" to "{to}"? This rewrites {files} note(s), remaps {transactions} transaction(s) and moves the account into a new folder.',
    'wizard.confirm.renameCategory': 'Rename category "{from}" to "{to}"? Its Misc subcategory becomes "{to} - Misc". This rewrites {files} note(s) and remaps {transactions} transaction(s).',
    'wizard.confirm.renameSubcategory': 'Rename "{from}" to "{to}"? This rewrites {files} note(s) and remaps {transactions} transaction(s).',
    'wizard.confirm.archiveAccount': 'Archive "{name}"? It keeps its history and can be restored, but it will no longer appear when you add transactions.',
    'wizard.confirm.deleteAccount': 'Delete "{name}"? It has no transactions, so nothing else changes. This cannot be undone.',
    'wizard.done.summary': 'You have {accounts} active account(s), {categories} categories and {subcategories} subcategories. You can reopen this wizard any time.',

    // Asset view
    'asset.title': 'Assets',
    'ui.asset': 'Assets',
    'ui.overview': 'Overview',
    'asset.netAssetTrend': 'Net asset trend',
} as const

export type LabelKey = keyof typeof strings

export function t(key: LabelKey): string {
	return strings[key]
}

export function tn(key: LabelKey, vars: Record<string, string>): string {
	let str: string = strings[key]
	for (const [k, v] of Object.entries(vars)) {
		str = str.replace(`{${k}}`, v)
	}
	return str
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatYearMonth(yearMonth: string, style: 'numeric' | 'short' = 'numeric'): string {
	const match = /^(\d{4})-(\d{2})$/.exec(yearMonth)
	if (!match) return yearMonth
	const month = Number(match[2])
	if (month < 1 || month > 12) return yearMonth
	return style === 'short'
		? `${MONTH_NAMES[month - 1]} ${match[1]}`
		: `${month}/${match[1]}`
}

export function formatMonthLabel(yearMonth: string): string {
	const match = /^\d{4}-(\d{2})$/.exec(yearMonth)
	if (!match) return yearMonth
	const month = Number(match[1])
	return month >= 1 && month <= 12 ? MONTH_NAMES[month - 1] : yearMonth
}
