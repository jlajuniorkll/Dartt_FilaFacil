'use client';

import { useState, useEffect, useMemo } from 'react';

// Extracts YouTube video ID from various URL formats
const getYoutubeVideoId = (url: string): string | null => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

export default function YoutubePlayer({ videoUrls }: { videoUrls: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const videoIds = useMemo(() => 
    videoUrls.map(getYoutubeVideoId).filter((id): id is string => id !== null),
    [videoUrls]
  );

  useEffect(() => {
    if (videoIds.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % videoIds.length);
    }, 30000); // Change video every 30 seconds

    return () => clearInterval(timer);
  }, [videoIds.length]);

  if (videoIds.length === 0) {
    return (
      <div className="w-full h-full bg-black rounded-xl flex items-center justify-center">
        <p className="text-white">Nenhum vídeo configurado.</p>
      </div>
    );
  }

  const currentVideoId = videoIds[currentIndex];

  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-lg">
      <iframe
        width="100%"
        height="100%"
        src={`https://www.youtube.com/embed/${currentVideoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${currentVideoId}`}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      ></iframe>
    </div>
  );
}
