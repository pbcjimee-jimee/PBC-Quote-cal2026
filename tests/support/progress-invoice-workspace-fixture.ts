import type { ProgressInvoiceSeriesWorkspaceDto } from '@/lib/progress-invoices/workspace-service'

export const workspaceFixture: ProgressInvoiceSeriesWorkspaceDto = {
  series: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', quoteId: null, sourceType: 'manual', version: 4,
    baseContractExGst: '100.00', gstRate: '0.10', recipientName: 'Builder', recipientCompany: '',
    recipientAddress: '1 Street', recipientEmail: '', recipientPhone: '', recipientAbn: '', siteName: 'Site',
    siteAddress: '2 Street', defaultDescription: 'Works', reference: '', status: 'active',
    acceptedNumberingBase: '100', jobberLinkLockedAt: null, adjustedContractExGst: '100.00',
    adjustedContractGst: '10.00', adjustedContractIncGst: '110.00', claimedExGst: '0.00',
    claimedGst: '0.00', claimedIncGst: '0.00', unclaimedExGst: '100.00', unclaimedGst: '10.00',
    unclaimedIncGst: '110.00', cumulativePercentage: '0.000000',
  },
  invoiceProfileReady: true,
  summary: { adjustedExGst: '100.00', adjustedGst: '10.00', adjustedIncGst: '110.00', claimedIncGst: '0.00', receivedIncGst: '0.00', outstandingIncGst: '0.00', creditBalanceIncGst: '0.00', unclaimedIncGst: '110.00', cumulativePercentage: '0.000000' },
  importedJobberObservation: null, currentRevisionSet: null, adjustments: [], claims: [], payments: [],
  readyDocuments: [], recentEvents: [], history: { nextCursor: null },
  capabilities: { canEditSeries: true, canEditBaseContract: true, canVoidSeriesDirectly: true, requiresClaimVoidWorkflow: false, canCreateClaim: true, canDownloadCurrent: false, canDownloadHistorical: false },
}
