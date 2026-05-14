import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { CustomerPanel } from '@/components/quote-form/customer-panel'
import { FinalSummary } from '@/components/quote-form/final-summary'
import { MaterialRow } from '@/components/quote-form/material-row'

describe('quote form pricing UI', () => {
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
})
