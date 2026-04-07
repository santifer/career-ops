/**
 * Tests for gmail-watch — Gmail polling module.
 * Only tests pure functions; functions that call execFileSync are excluded.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesRecruiterPattern, classifyResponse, parseGmailMessage } from './gmail-watch.mjs';

describe('matchesRecruiterPattern', () => {
  it('matches default pattern: interview', () => {
    assert.equal(matchesRecruiterPattern('Your Interview Invitation'), true);
  });

  it('matches default pattern: application', () => {
    assert.equal(matchesRecruiterPattern('Your Application has been received'), true);
  });

  it('matches default pattern: next steps', () => {
    assert.equal(matchesRecruiterPattern('Next Steps for Your Candidacy'), true);
  });

  it('matches default pattern: offer', () => {
    assert.equal(matchesRecruiterPattern('Exciting Offer from Acme Corp'), true);
  });

  it('matches default pattern: phone screen', () => {
    assert.equal(matchesRecruiterPattern('Schedule Your Phone Screen'), true);
  });

  it('matches default pattern: recruiter', () => {
    assert.equal(matchesRecruiterPattern('A recruiter wants to connect'), true);
  });

  it('is case-insensitive', () => {
    assert.equal(matchesRecruiterPattern('INTERVIEW INVITATION'), true);
    assert.equal(matchesRecruiterPattern('Application Update'), true);
  });

  it('returns false when subject does not match any pattern', () => {
    assert.equal(matchesRecruiterPattern('Your Amazon order has shipped'), false);
    assert.equal(matchesRecruiterPattern('Weekly newsletter'), false);
  });

  it('accepts custom patterns', () => {
    assert.equal(matchesRecruiterPattern('Coding Challenge Invitation', ['coding challenge']), true);
    assert.equal(matchesRecruiterPattern('Interview Invitation', ['coding challenge']), false);
  });

  it('handles empty subject', () => {
    assert.equal(matchesRecruiterPattern(''), false);
  });
});

describe('classifyResponse', () => {
  it('classifies offer letter as Offer', () => {
    assert.equal(classifyResponse('We are pleased to extend an offer to join our team.'), 'Offer');
  });

  it('classifies offer letter variant as Offer', () => {
    assert.equal(classifyResponse('Please find attached your offer letter.'), 'Offer');
  });

  it('classifies compensation package as Offer', () => {
    assert.equal(classifyResponse('Here are the details of your compensation package.'), 'Offer');
  });

  it('classifies pleased to offer as Offer', () => {
    assert.equal(classifyResponse('We are pleased to offer you the position.'), 'Offer');
  });

  it('classifies schedule/interview as Interview', () => {
    assert.equal(classifyResponse('We would like to schedule an interview with you.'), 'Interview');
  });

  it('classifies meet as Interview', () => {
    assert.equal(classifyResponse('Can we meet this week to discuss your application?'), 'Interview');
  });

  it('classifies screen as Interview', () => {
    assert.equal(classifyResponse('We would like to set up a screen with you.'), 'Interview');
  });

  it('classifies chat as Interview', () => {
    assert.equal(classifyResponse('I would love to chat with you about this role.'), 'Interview');
  });

  it('classifies call as Interview', () => {
    assert.equal(classifyResponse('Would you be available for a call next week?'), 'Interview');
  });

  it('classifies rejection keywords as Rejected', () => {
    assert.equal(classifyResponse('We are move forward with other candidates.'), 'Rejected');
  });

  it('classifies not moving forward as Rejected', () => {
    assert.equal(classifyResponse('Unfortunately we are not moving forward with your application.'), 'Rejected');
  });

  it('classifies decided not to as Rejected', () => {
    assert.equal(classifyResponse('We have decided not to proceed.'), 'Rejected');
  });

  it('classifies unfortunately as Rejected', () => {
    assert.equal(classifyResponse('Unfortunately, your application was not successful.'), 'Rejected');
  });

  it('classifies regret as Rejected', () => {
    assert.equal(classifyResponse('We regret to inform you that...'), 'Rejected');
  });

  it('defaults to Responded for generic responses', () => {
    assert.equal(classifyResponse('Thank you for reaching out! We will get back to you soon.'), 'Responded');
  });

  it('defaults to Responded for empty body', () => {
    assert.equal(classifyResponse(''), 'Responded');
  });

  it('prioritizes Offer over Interview when both match', () => {
    // "schedule" + "offer letter" — Offer should win
    assert.equal(classifyResponse('We would like to schedule a call to discuss your offer letter.'), 'Offer');
  });

  it('prioritizes Interview over Rejected when both match', () => {
    // "interview" + "unfortunately" — Interview should win
    assert.equal(classifyResponse('Unfortunately we need to reschedule your interview.'), 'Interview');
  });
});

describe('parseGmailMessage', () => {
  const msg = {
    from: 'recruiter@acme.com',
    subject: 'Interview Invitation',
    body: 'We would like to schedule an interview with you for the Senior Engineer role.',
    date: '2026-04-07',
  };

  it('returns correct from field', () => {
    const result = parseGmailMessage(msg);
    assert.equal(result.from, 'recruiter@acme.com');
  });

  it('extracts domain from email', () => {
    const result = parseGmailMessage(msg);
    assert.equal(result.domain, 'acme.com');
  });

  it('returns subject unchanged', () => {
    const result = parseGmailMessage(msg);
    assert.equal(result.subject, 'Interview Invitation');
  });

  it('returns date unchanged', () => {
    const result = parseGmailMessage(msg);
    assert.equal(result.date, '2026-04-07');
  });

  it('classifies body as suggestedStatus', () => {
    const result = parseGmailMessage(msg);
    assert.equal(result.suggestedStatus, 'Interview');
  });

  it('bodyPreview is first 200 chars of body', () => {
    const longBody = 'a'.repeat(300);
    const result = parseGmailMessage({ ...msg, body: longBody });
    assert.equal(result.bodyPreview, longBody.slice(0, 200));
    assert.equal(result.bodyPreview.length, 200);
  });

  it('bodyPreview is full body when body is shorter than 200', () => {
    const shortBody = 'Short body text.';
    const result = parseGmailMessage({ ...msg, body: shortBody });
    assert.equal(result.bodyPreview, shortBody);
  });

  it('handles email with no @ sign gracefully (domain is undefined)', () => {
    const result = parseGmailMessage({ ...msg, from: 'nodomain' });
    assert.equal(result.domain, undefined);
  });

  it('classifies offer email correctly', () => {
    const offerMsg = {
      from: 'hr@startup.io',
      subject: 'Offer Letter',
      body: 'We are pleased to extend an offer to you.',
      date: '2026-04-01',
    };
    const result = parseGmailMessage(offerMsg);
    assert.equal(result.suggestedStatus, 'Offer');
    assert.equal(result.domain, 'startup.io');
  });
});
