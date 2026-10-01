/**
 * EventRepositoryImpl — Infrastructure implementation of EventRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on CommunityEvent model.
 * Duplicate RSVP detection uses the unique constraint on (eventId, userId).
 *
 * @see Requirements 14.1, 14.2, 14.3, 14.4
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type { EventRepository } from '@core/domains/event/repositories/EventRepository';
import type {
  CommunityEvent,
  CreateEventInput,
  EventRsvp,
  RsvpResponse,
} from '@core/domains/event/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaCommunityEvent {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  date: Date;
  time: string;
  location: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaEventToDomain(p: PrismaCommunityEvent): CommunityEvent {
  return {
    id: p.id,
    tenantId: p.tenantId,
    title: p.title,
    description: p.description,
    date: p.date,
    time: p.time,
    location: p.location,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

interface PrismaEventRsvp {
  id: string;
  eventId: string;
  userId: string;
  response: string;
  createdAt: Date;
}

function mapPrismaRsvpToDomain(p: PrismaEventRsvp): EventRsvp {
  return {
    id: p.id,
    eventId: p.eventId,
    userId: p.userId,
    response: p.response as RsvpResponse,
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const EventRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): EventRepository => {
  const eventRepo: TenantScopedRepository<PrismaCommunityEvent> =
    createTenantScopedRepository(
      prismaClient.communityEvent as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // createEvent
    // -----------------------------------------------------------------------
    async createEvent(
      tenantId: string,
      data: CreateEventInput,
      createdBy: string,
    ): Promise<DomainResult<CommunityEvent>> {
      try {
        const event = await eventRepo.create(tenantId, {
          data: {
            title: data.title,
            description: data.description,
            date: data.date,
            time: data.time,
            location: data.location,
            createdBy,
          },
        });

        return ok(mapPrismaEventToDomain(event));
      } catch (error) {
        return fail(
          technicalError(
            'EVENT_CREATE_FAILED',
            'Failed to create community event',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // submitRsvp
    // -----------------------------------------------------------------------
    async submitRsvp(
      eventId: string,
      userId: string,
      response: RsvpResponse,
    ): Promise<DomainResult<EventRsvp>> {
      try {
        const rsvp = await prismaClient.eventRsvp.upsert({
          where: {
            eventId_userId: { eventId, userId },
          },
          update: { response },
          create: { eventId, userId, response },
        });

        return ok(mapPrismaRsvpToDomain(rsvp as unknown as PrismaEventRsvp));
      } catch (error) {
        return fail(
          technicalError(
            'EVENT_RSVP_SUBMIT_FAILED',
            'Failed to submit RSVP',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByTenant
    // -----------------------------------------------------------------------
    async findByTenant(
      tenantId: string,
    ): Promise<DomainResult<CommunityEvent[]>> {
      try {
        const events = await eventRepo.findMany(tenantId, {
          orderBy: { date: 'desc' },
        });

        return ok(events.map(mapPrismaEventToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'EVENT_FIND_BY_TENANT_FAILED',
            'Failed to find events for tenant',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findRsvpsByEvent
    // -----------------------------------------------------------------------
    async findRsvpsByEvent(
      eventId: string,
    ): Promise<DomainResult<EventRsvp[]>> {
      try {
        const rsvps = await prismaClient.eventRsvp.findMany({
          where: { eventId },
          orderBy: { createdAt: 'desc' },
        });

        return ok(
          (rsvps as unknown as PrismaEventRsvp[]).map(mapPrismaRsvpToDomain),
        );
      } catch (error) {
        return fail(
          technicalError(
            'EVENT_RSVPS_FIND_FAILED',
            'Failed to find RSVPs for event',
            { cause: error },
          ),
        );
      }
    },
  };
};
