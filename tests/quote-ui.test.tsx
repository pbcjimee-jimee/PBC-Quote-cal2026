import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { CustomerPanel } from '@/components/quote-form/customer-panel'
import { FinalSummary } from '@/components/quote-form/final-summary'
import { MaterialRow } from '@/components/quote-form/material-row'
import { OptionTotalsSummary } from '@/components/quote-form/option-totals-summary'
import { QuoteDetailView } from '@/components/quote-detail/quote-detail-view'
import { QuoteCard } from '@/components/quote-list/quote-card'
import type { QuoteRecord } from '@/lib/dev-data'

describe('quote form pricing UI', () => {
  const quoteRecord: QuoteRecord = {
    id: 'quote-id-1',
    customerName: 'Jane Customer',
    customerAddress: '10 Main St',
    jobberQuoteId: 'encoded-quote-id',
    areaSqft: null,
    workType: 'Exterior',
    workingDays: '5.00',
    labourPerDay: '2.00',
    formula1Total: '2500.00',
    formula2Total: '2600.00',
    formula3Total: '2700.00',
    formula4Total: '2400.00',
    formula5Total: '2450.00',
    selectedMin: 4,
    selectedMax: 3,
    subtotal: '2550.00',
    finalTotal: '2550.00',
    pricingSettingsSnapshot: {
      f1LabourRate: 500,
      f2LabourRate: 460,
      f3LabourRate: 460,
      f4LabourRate: 380,
      f5LabourRate: 380,
      f2Margin: 0.3,
      f3Margin: 0.3,
      f4Margin: 0.25,
      f5Margin: 0.3,
    },
    createdAt: '2026-05-14T00:00:00Z',
    items: [],
    options: [],
    jobberSnapshot: null,
  }

  it('shows edit and delete actions on quote cards', () => {
    const markup = renderToStaticMarkup(createElement(QuoteCard, { quote: quoteRecord }))

    expect(markup).toContain('View')
    expect(markup).toContain('Edit')
    expect(markup).toContain(`/quotes/${quoteRecord.id}/edit`)
    expect(markup).toContain('Delete')
  })

  it('shows subtotal details for labour and material totals', () => {
    const markup = renderToStaticMarkup(
      createElement(FinalSummary, {
        labourTotal: new Decimal('1200'),
        materialTotal: new Decimal('255.74'),
        subtotal: new Decimal('1455.74'),
        finalTotal: new Decimal('1455.74'),
        jobberFinancialSummary: null,
      })
    )

    expect(markup).toContain('Labour total')
    expect(markup).toContain('$1200.00')
    expect(markup).toContain('Material total')
    expect(markup).toContain('$255.74')
    expect(markup).toContain('Subtotal')
  })

  it('shows Jobber quote total, expenses total, and profit margin in the right summary', () => {
    const markup = renderToStaticMarkup(
      createElement(FinalSummary, {
        labourTotal: new Decimal('1200'),
        materialTotal: new Decimal('255.74'),
        subtotal: new Decimal('1455.74'),
        finalTotal: new Decimal('1455.74'),
        jobberFinancialSummary: {
          quoteTotal: 1500,
          expensesTotal: 300,
          profit: 1200,
          profitMarginPercent: 80,
        },
      })
    )

    expect(markup).toContain('Jobber profit')
    expect(markup).toContain('Quote total')
    expect(markup).toContain('$1,500.00')
    expect(markup).toContain('Expenses total')
    expect(markup).toContain('$300.00')
    expect(markup).toContain('Profit')
    expect(markup).toContain('$1,200.00')
    expect(markup).toContain('Profit margin')
    expect(markup).toContain('80.0%')
  })

  it('shows option totals separately from the main quote final total', () => {
    const markup = renderToStaticMarkup(
      createElement(OptionTotalsSummary, {
        options: [
          { id: 'option-1', title: 'Option 1 - Garage door repaint', finalTotal: new Decimal('550') },
          { id: 'option-2', title: 'Option 2 - Fence staining', finalTotal: new Decimal('1240') },
        ],
      })
    )

    expect(markup).toContain('Optional Add-ons')
    expect(markup).toContain('Option 1 - Garage door repaint')
    expect(markup).toContain('$550.00')
    expect(markup).toContain('Option 2 - Fence staining')
    expect(markup).toContain('$1240.00')
    expect(markup).toContain('not included in main total')
  })

  it('edits only a single RRP price for material rows', () => {
    const markup = renderToStaticMarkup(
      createElement(MaterialRow, {
        item: {
          id: 'item-1',
          name: 'Dulux Acratex Roof Membrane Satin Monument 15L',
          manufacturer: 'Dulux',
          unit: '15L',
          marketPrice: '255.74',
          actualPrice: '255.74',
          quantity: '1',
          workingDays: '2',
          labourPerDay: '1',
          areaId: 'area-eaves',
          areaName: 'Eaves',
          areaScope: 'exterior',
          isCustom: false,
        },
        areas: [
          { id: 'area-eaves', scope: 'exterior', name: 'Eaves', active: true, position: 0 },
          { id: 'area-fascia', scope: 'exterior', name: 'Fascia', active: true, position: 1 },
        ],
        onChange: () => undefined,
        onRemove: () => undefined,
      })
    )

    expect(markup).toContain('RRP')
    expect(markup).toContain('Area')
    expect(markup).toContain('Working Days')
    expect(markup).toContain('Labour / Day')
    expect(markup).toContain('Eaves')
    expect(markup).toContain('Fascia')
    expect(markup).not.toContain('Market')
    expect(markup).not.toContain('Actual')
  })

  it('shows Jobber customer type without the area sqft field', () => {
    const markup = renderToStaticMarkup(
      createElement(CustomerPanel, {
        customerName: 'Jane Customer',
        customerAddress: '10 Main St',
        jobberLookupType: 'quote',
        jobberQuoteId: '2345',
        workType: 'Exterior',
        customerType: 'Real Estate',
        onCustomerNameChange: () => undefined,
        onCustomerAddressChange: () => undefined,
        onJobberQuoteIdChange: () => undefined,
        onJobberLookupTypeChange: () => undefined,
        onFetchJobberQuote: () => undefined,
        onWorkTypeChange: () => undefined,
        isFetchingJobberQuote: false,
        jobberFetchError: null,
        jobberQuoteDraft: null,
      })
    )

    expect(markup).toContain('Customer Type')
    expect(markup).toContain('Real Estate')
    expect(markup).not.toContain('Area Sqft')
    expect(markup).not.toContain('Area sqft')
  })

  it('lets the user choose whether the Jobber lookup is a quote or job number', () => {
    const markup = renderToStaticMarkup(
      createElement(CustomerPanel, {
        customerName: 'Jane Customer',
        customerAddress: '10 Main St',
        jobberLookupType: 'job',
        jobberQuoteId: '6789',
        workType: 'Exterior',
        customerType: 'Residential',
        onCustomerNameChange: () => undefined,
        onCustomerAddressChange: () => undefined,
        onJobberLookupTypeChange: () => undefined,
        onJobberQuoteIdChange: () => undefined,
        onFetchJobberQuote: () => undefined,
        onWorkTypeChange: () => undefined,
        isFetchingJobberQuote: false,
        jobberFetchError: null,
        jobberQuoteDraft: null,
      })
    )

    expect(markup).toContain('Quote')
    expect(markup).toContain('Job')
    expect(markup).toContain('Jobber Job Number or URL')
  })

  it('shows expenses from a converted Jobber job in the quote summary', () => {
    const markup = renderToStaticMarkup(
      createElement(CustomerPanel, {
        customerName: 'Jane Customer',
        customerAddress: '10 Main St',
        jobberLookupType: 'quote',
        jobberQuoteId: '2345',
        workType: 'Exterior',
        customerType: 'Real Estate',
        onCustomerNameChange: () => undefined,
        onCustomerAddressChange: () => undefined,
        onJobberQuoteIdChange: () => undefined,
        onJobberLookupTypeChange: () => undefined,
        onFetchJobberQuote: () => undefined,
        onWorkTypeChange: () => undefined,
        isFetchingJobberQuote: false,
        jobberFetchError: null,
        jobberQuoteDraft: {
          jobberQuoteId: 'encoded-quote-id',
          sourceType: 'quote',
          quoteNumber: '2345',
          createdAt: '2026-05-13T01:23:45Z',
          customerName: 'Jane Customer',
          customerAddress: '10 Main St',
          workType: 'Exterior',
          areaSqft: null,
          customerType: 'Real Estate',
          sourceUrl: 'https://secure.getjobber.com/quotes/2345',
          productsAndServices: [],
          jobExpensesError: null,
          financialSummary: {
            quoteTotal: 0,
            expensesTotal: 245.5,
            profit: -245.5,
            profitMarginPercent: null,
          },
          jobExpenses: [
            {
              jobId: 'job-id-1',
              jobNumber: 6789,
              jobTitle: 'Exterior repaint job',
              jobStatus: 'ACTIVE',
              jobUrl: 'https://secure.getjobber.com/jobs/6789',
              expenses: [
                {
                  id: 'expense-id-1',
                  title: 'Paint supplies',
                  description: 'Primer and rollers',
                  date: '2026-05-14T00:00:00Z',
                  total: 245.5,
                  enteredBy: 'Admin User',
                  paidBy: 'Painter One',
                  reimbursableTo: null,
                },
              ],
            },
          ],
        },
      })
    )

    expect(markup).toContain('Job Expenses')
    expect(markup).toContain('Job #6789')
    expect(markup).toContain('Paint supplies')
    expect(markup).toContain('$245.50')
  })

  it('shows a reconnect action when Jobber hides job expenses due to permissions', () => {
    const markup = renderToStaticMarkup(
      createElement(CustomerPanel, {
        customerName: 'Jane Customer',
        customerAddress: '10 Main St',
        jobberLookupType: 'quote',
        jobberQuoteId: '2345',
        workType: 'Exterior',
        customerType: 'Real Estate',
        onCustomerNameChange: () => undefined,
        onCustomerAddressChange: () => undefined,
        onJobberQuoteIdChange: () => undefined,
        onJobberLookupTypeChange: () => undefined,
        onFetchJobberQuote: () => undefined,
        onWorkTypeChange: () => undefined,
        isFetchingJobberQuote: false,
        jobberFetchError: null,
        jobberQuoteDraft: {
          jobberQuoteId: 'encoded-quote-id',
          sourceType: 'quote',
          quoteNumber: '2345',
          createdAt: '2026-05-13T01:23:45Z',
          customerName: 'Jane Customer',
          customerAddress: '10 Main St',
          workType: 'Exterior',
          areaSqft: null,
          customerType: 'Real Estate',
          sourceUrl: 'https://secure.getjobber.com/quotes/2345',
          productsAndServices: [],
          jobExpenses: [],
          jobExpensesError: 'Jobber hid Job or Expense data due to permissions. Turn on Jobs Read and Expenses Read, save the app, then Reconnect Jobber so the current token receives the new access.',
          financialSummary: {
            quoteTotal: 0,
            expensesTotal: 0,
            profit: 0,
            profitMarginPercent: null,
          },
        },
      })
    )

    expect(markup).toContain('Reconnect Jobber')
    expect(markup).toContain('/api/jobber/connect')
  })

  it('shows saved Jobber fetch data on quote detail pages', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteDetailView, {
        quote: {
          ...quoteRecord,
          jobberSnapshot: {
            jobberQuoteId: 'encoded-quote-id',
            sourceType: 'quote',
            quoteNumber: '2345',
            createdAt: '2026-05-13T01:23:45Z',
            customerName: 'Jane Customer',
            customerAddress: '10 Main St',
            workType: 'Exterior',
            areaSqft: null,
            customerType: 'Real Estate',
            sourceUrl: 'https://secure.getjobber.com/quotes/2345',
            productsAndServices: [
              {
                id: 'line-item-1',
                name: 'Exterior repaint',
                category: 'SERVICE',
                description: 'Walls and trim',
                quantity: 1,
                unitPrice: 2500,
                totalPrice: 2500,
                linkedName: null,
              },
            ],
            jobExpenses: [
              {
                jobId: 'job-id-1',
                jobNumber: 6789,
                jobTitle: 'Exterior repaint job',
                jobStatus: 'ACTIVE',
                jobUrl: 'https://secure.getjobber.com/jobs/6789',
                expenses: [
                  {
                    id: 'expense-id-1',
                    title: 'Paint supplies',
                    description: 'Primer',
                    date: '2026-05-14T00:00:00Z',
                    total: 245.5,
                    enteredBy: 'Admin User',
                    paidBy: 'Painter One',
                    reimbursableTo: null,
                  },
                ],
              },
            ],
            jobExpensesError: null,
            financialSummary: {
              quoteTotal: 2500,
              expensesTotal: 245.5,
              profit: 2254.5,
              profitMarginPercent: 90.2,
            },
          },
        },
      })
    )

    expect(markup).toContain('Jobber Data')
    expect(markup).toContain('Created date')
    expect(markup).toContain('Product / Service')
    expect(markup).toContain('Exterior repaint')
    expect(markup).toContain('Job Expenses')
    expect(markup).toContain('Paint supplies')
    expect(markup).toContain('Jobber profit')
    expect(markup).toContain('90.2%')
  })

  it('shows saved option totals on quote detail pages without changing the main final total', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteDetailView, {
        quote: {
          ...quoteRecord,
          finalTotal: '2550.00',
          options: [
            {
              id: 'option-1',
              quoteId: quoteRecord.id,
              title: 'Option 1 - Garage door repaint',
              workingDays: '1.00',
              labourPerDay: '1.00',
              materialMarket: '50.00',
              materialActual: '50.00',
              formula1Total: '550.00',
              formula2Total: '648.00',
              formula3Total: '663.00',
              formula4Total: '525.00',
              formula5Total: '559.00',
              selectedMin: 1,
              selectedMax: 1,
              subtotal: '550.00',
              finalTotal: '550.00',
              position: 0,
              items: [],
            },
          ],
        },
      })
    )

    expect(markup).toContain('Final')
    expect(markup).toContain('$2550.00')
    expect(markup).toContain('Optional Add-ons')
    expect(markup).toContain('Option 1 - Garage door repaint')
    expect(markup).toContain('$550.00')
    expect(markup).toContain('not included in main total')
  })

  it('shows edit and delete actions on quote detail pages', () => {
    const markup = renderToStaticMarkup(createElement(QuoteDetailView, { quote: quoteRecord }))

    expect(markup).toContain('Edit')
    expect(markup).toContain(`/quotes/${quoteRecord.id}/edit`)
    expect(markup).toContain('Delete')
  })
})
