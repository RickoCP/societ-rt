/**
 * Subscription Management Page — App Router page for subscription and billing.
 *
 * This page provides access to the SubscriptionScreen component for viewing
 * and managing tenant subscription including:
 * - Current plan details and status
 * - Usage metrics with threshold warnings
 * - Plan comparison and upgrade/downgrade flow
 * - Billing history and invoice management
 *
 * Route: /admin/subscription
 *
 * @see Requirements 22.1 (App Router pages for administration)
 * @see SubscriptionScreen for full feature documentation
 */

import type { Metadata } from 'next';
import { SubscriptionScreen } from '@features/subscription/screens/SubscriptionScreen';

/**
 * Page metadata for SEO and browser tab display.
 */
export const metadata: Metadata = {
  title: 'Subscription | SocieT RT Admin',
  description:
    'View and manage subscription plan, usage metrics, and billing history.',
};

/**
 * SubscriptionPage — App Router page component for subscription management.
 */
export default function SubscriptionPage() {
  return <SubscriptionScreen />;
}
