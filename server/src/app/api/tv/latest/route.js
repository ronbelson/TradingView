import { NextResponse } from 'next/server';
import { getEvents, getLatest } from '@/lib/store';
import { buildFullStoryPack } from '@/lib/enrich-story';
import { buildForecastPath } from '@/lib/forecast-path';
import { buildScene } from '@/lib/scene';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const latest = await getLatest();
  const recentEvents = latest ? await getEvents(5) : [];
  const story = latest ? buildFullStoryPack(latest) : null;
  const forecast = story ? buildForecastPath(story, latest) : null;
  const scene = buildScene(latest, story, forecast, recentEvents);
  return NextResponse.json({
    ok: true,
    scene,
    // raw kept for debug only
    latest,
    forecast,
  });
}
