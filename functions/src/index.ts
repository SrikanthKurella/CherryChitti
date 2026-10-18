import { randomInt, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

if (getApps().length === 0) initializeApp();

const db = getFirestore();
const auth = getAuth();
const resendApiKey = defineSecret('RESEND_API_KEY');
const senderEmail = defineString('OTP_SENDER_EMAIL');
const OTP_TTL_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_SEND_INTERVAL_MS = 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const IP_RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_IP_WINDOW = 20;
const MAX_VERIFY_ATTEMPTS = 5;

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }
  return email;
}

function emailDigest(email: string): string {
  return createHash('sha256').update(email).digest('hex');
}

function codeDigest(challengeId: string, code: string): Buffer {
  return createHash('sha256').update(`${challengeId}:${code}`).digest();
}

async function sendOtp(email: string, code: string): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey.value()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: senderEmail.value(),
      to: [email],
      subject: 'Your Cherry Chits signup verification code',
      text: `Your Cherry Chits verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
      html: `<p>Your Cherry Chits verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this code, you can ignore this email.</p>`,
    }),
  });
  if (!response.ok) {
    logger.error('Resend rejected the signup OTP email.', { status: response.status });
    throw new HttpsError('unavailable', 'Could not send the verification email. Try again later.');
  }
}

export const beginSignup = onCall(
  { secrets: [resendApiKey] },
  async (request) => {
    const email = normalizeEmail(request.data?.email);
    const digest = emailDigest(email);
    const clientIp = request.rawRequest.ip || request.rawRequest.socket.remoteAddress || digest;
    const ipDigest = emailDigest(`ip:${clientIp}`);
    let accountAlreadyExists = false;
    try {
      await auth.getUserByEmail(email);
      accountAlreadyExists = true;
    } catch (error) {
      if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    }

    const now = Date.now();
    const challengeId = randomUUID();
    const code = randomInt(100000, 1000000).toString();
    const challengeRef = db.collection('signupOtpChallenges').doc(challengeId);
    const rateLimitRef = db.collection('signupOtpRateLimits').doc(digest);
    const ipRateLimitRef = db.collection('signupOtpIpRateLimits').doc(ipDigest);

    await db.runTransaction(async (transaction) => {
      const rateLimitSnapshot = await transaction.get(rateLimitRef);
      const ipRateLimitSnapshot = await transaction.get(ipRateLimitRef);
      const rateLimit = rateLimitSnapshot.data();
      const ipRateLimit = ipRateLimitSnapshot.data();
      const previousChallengeId = rateLimit?.activeChallengeId as string | undefined;
      const previousChallengeRef = previousChallengeId
        ? db.collection('signupOtpChallenges').doc(previousChallengeId)
        : null;
      const previousChallenge = previousChallengeRef
        ? await transaction.get(previousChallengeRef)
        : null;

      const windowStartedAt = rateLimit?.windowStartedAt as number | undefined;
      const sendsInWindow = windowStartedAt && now - windowStartedAt < RATE_WINDOW_MS
        ? (rateLimit?.sendsInWindow as number)
        : 0;
      const lastSentAt = rateLimit?.lastSentAt as number | undefined;
      if (lastSentAt && now - lastSentAt < MIN_SEND_INTERVAL_MS) {
        throw new HttpsError('resource-exhausted', 'Wait one minute before requesting another code.');
      }
      if (sendsInWindow >= MAX_SENDS_PER_WINDOW) {
        throw new HttpsError('resource-exhausted', 'Too many verification codes requested. Try again tomorrow.');
      }
      const ipWindowStartedAt = ipRateLimit?.windowStartedAt as number | undefined;
      const ipSendsInWindow = ipWindowStartedAt && now - ipWindowStartedAt < IP_RATE_WINDOW_MS
        ? (ipRateLimit?.sendsInWindow as number)
        : 0;
      if (ipSendsInWindow >= MAX_SENDS_PER_IP_WINDOW) {
        throw new HttpsError('resource-exhausted', 'Too many verification codes requested from this network. Try again later.');
      }

      if (previousChallenge?.exists && previousChallenge.data()?.status === 'pending') {
        transaction.update(previousChallengeRef!, { status: 'replaced' });
      }
      transaction.set(challengeRef, {
        emailDigest: digest,
        codeDigest: codeDigest(challengeId, code).toString('hex'),
        expiresAt: Timestamp.fromMillis(now + OTP_TTL_MS),
        attempts: 0,
        status: 'pending',
        accountAlreadyExists,
      });
      transaction.set(rateLimitRef, {
        activeChallengeId: challengeId,
        windowStartedAt: windowStartedAt && now - windowStartedAt < RATE_WINDOW_MS ? windowStartedAt : now,
        sendsInWindow: sendsInWindow + 1,
        lastSentAt: now,
      });
      transaction.set(ipRateLimitRef, {
        windowStartedAt: ipWindowStartedAt && now - ipWindowStartedAt < IP_RATE_WINDOW_MS
          ? ipWindowStartedAt
          : now,
        sendsInWindow: ipSendsInWindow + 1,
      });
    });

    if (!accountAlreadyExists) {
      try {
        await sendOtp(email, code);
      } catch (error) {
        await challengeRef.delete();
        throw error;
      }
    }

    return {
      challengeId,
      message: 'If this address can be registered, a verification code has been sent.',
    };
  },
);

export const finishSignup = onCall(
  async (request) => {
    const email = normalizeEmail(request.data?.email);
    const challengeId = request.data?.challengeId;
    const code = request.data?.code;
    const password = request.data?.password;
    if (typeof challengeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(challengeId)
        || typeof code !== 'string' || !/^\d{6}$/.test(code)
        || typeof password !== 'string' || password.length < 6 || password.length > 128) {
      throw new HttpsError('invalid-argument', 'Enter the verification code and a password of at least 6 characters.');
    }

    const challengeRef = db.collection('signupOtpChallenges').doc(challengeId);
    let verified = false;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(challengeRef);
      if (!snapshot.exists) return;
      const challenge = snapshot.data()!;
      if (challenge.status !== 'pending'
          || challenge.emailDigest !== emailDigest(email)
          || challenge.accountAlreadyExists === true
          || !(challenge.expiresAt instanceof Timestamp)
          || challenge.expiresAt.toMillis() <= Date.now()
          || challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
        return;
      }
      const expected = Buffer.from(String(challenge.codeDigest), 'hex');
      const received = codeDigest(challengeId, code);
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
        const attempts = challenge.attempts + 1;
        transaction.update(challengeRef, {
          attempts,
          ...(attempts >= MAX_VERIFY_ATTEMPTS ? { status: 'locked' } : {}),
        });
        return;
      }
      transaction.update(challengeRef, { attempts: challenge.attempts + 1, status: 'redeeming' });
      verified = true;
    });

    if (!verified) {
      throw new HttpsError('permission-denied', 'The verification code is invalid or expired. Request a new code.');
    }

    try {
      const user = await auth.createUser({ email, password, emailVerified: true });
      const customToken = await auth.createCustomToken(user.uid);
      await challengeRef.update({ status: 'consumed', consumedAt: Timestamp.now() });
      return { customToken };
    } catch (error) {
      await challengeRef.update({ status: 'consumed', consumedAt: Timestamp.now() });
      logger.error('Could not create a Firebase account after OTP verification.', {
        code: (error as { code?: string }).code,
      });
      throw new HttpsError('already-exists', 'Could not complete account creation. Sign in or request a new verification code.');
    }
  },
);
