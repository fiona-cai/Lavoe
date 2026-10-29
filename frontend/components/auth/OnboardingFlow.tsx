"use client";

import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ppEditorialNew } from "@/lib/fonts";
import { Play } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileLandingPage } from "./MobileLandingPage";

interface OnboardingFlowProps {
  open: boolean;
  onComplete: () => void;
}

const onboardingSteps = [
  {
    title: "Welcome to Lavoe",
    titleClassName: "flex items-center justify-center gap-2",
    subtitle: "Anyone can make music with AI",
  },
  {
    title: "Generate beats with AI",
    subtitle: "Rock, reggaeton, jazz, imagination is the limit",
  },
  {
    title: "Agentic audio editing",
    subtitle: "Chop up the beats, change their speed, and duplicate",
  },
  {
    title: "Standard DAW capabilities",
    subtitle:
      "Import existing beats, record yourself, and the rest of standard DAW functions",
  },
];

export function OnboardingFlow({
  open,
  onComplete,
}: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMobile = useIsMobile();
  const isLastStep = currentStep === onboardingSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(currentStep + 1);
      setHasAudio(false);
      setIsPlaying(true);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
      setHasAudio(false);
      setIsPlaying(true);
    }
  };

  const handleAudioClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current && !hasAudio) {
      videoRef.current.muted = false;
      setHasAudio(true);
    }
  };

  const handleVideoClick = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const currentStepData = onboardingSteps[currentStep];

  // Mobile: Show full screen landing page
  if (isMobile && open) {
    return <MobileLandingPage />;
  }

  // Desktop: Dialog modal
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="!w-[50vw] !max-w-4xl h-[650px] px-12 bg-[#151515] border-[#1a1a1a]"
      >
        <DialogHeader className="text-center space-y-3">
          {currentStep === 0 ? (
            <DialogTitle
              className={`${ppEditorialNew.className} text-5xl text-foreground font-normal flex items-center justify-center gap-2`}
            >
              <span>Welcome to</span>
              <span>Lavoe</span>
            </DialogTitle>
          ) : (
            <DialogTitle
              className={`${ppEditorialNew.className} text-5xl text-foreground font-normal text-center`}
            >
              {currentStepData.title}
            </DialogTitle>
          )}
          {currentStepData.subtitle && (
            <DialogDescription className="text-base text-gray-400 font-normal text-center">
              {currentStepData.subtitle}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Video Content */}
        <div className="w-full bg-muted rounded-lg border border-border flex items-center justify-center shadow-sm h-96 overflow-hidden relative">
          {currentStep === 0 ? (
            <>
              <video
                ref={videoRef}
                key="overall-demo"
                src="/overall-demo.mp4"
                autoPlay
                loop
                muted
                playsInline
                onClick={handleVideoClick}
                className="w-full h-full object-cover rounded-lg cursor-pointer"
              />
              {!hasAudio && (
                <div
                  className="absolute top-4 left-4 cursor-pointer z-10"
                  onClick={handleAudioClick}
                >
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 hover:bg-black/80 transition-all">
                    <p className="text-white text-sm font-medium">
                      Click for audio
                    </p>
                  </div>
                </div>
              )}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-6">
                    <Play className="w-12 h-12 text-white fill-white" />
                  </div>
                </div>
              )}
            </>
          ) : currentStep === 1 ? (
            <>
              <video
                ref={videoRef}
                key="ai-generate"
                src="/ai-audio-generate.mp4"
                autoPlay
                loop
                muted
                playsInline
                onClick={handleVideoClick}
                className="w-full h-full object-cover rounded-lg cursor-pointer"
              />
              {!hasAudio && (
                <div
                  className="absolute top-4 left-4 cursor-pointer z-10"
                  onClick={handleAudioClick}
                >
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 hover:bg-black/80 transition-all">
                    <p className="text-white text-sm font-medium">
                      Click for audio
                    </p>
                  </div>
                </div>
              )}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-6">
                    <Play className="w-12 h-12 text-white fill-white" />
                  </div>
                </div>
              )}
            </>
          ) : currentStep === 2 ? (
            <>
              <video
                ref={videoRef}
                key="agent-mode"
                src="/agent-mode.mp4"
                autoPlay
                loop
                muted
                playsInline
                onClick={handleVideoClick}
                className="w-full h-full object-cover rounded-lg cursor-pointer"
              />
              {!hasAudio && (
                <div
                  className="absolute top-4 left-4 cursor-pointer z-10"
                  onClick={handleAudioClick}
                >
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 hover:bg-black/80 transition-all">
                    <p className="text-white text-sm font-medium">
                      Click for audio
                    </p>
                  </div>
                </div>
              )}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-6">
                    <Play className="w-12 h-12 text-white fill-white" />
                  </div>
                </div>
              )}
            </>
          ) : currentStep === 3 ? (
            <>
              <video
                ref={videoRef}
                key="overall-demo-2"
                src="/overall-demo.mp4"
                autoPlay
                loop
                muted
                playsInline
                onClick={handleVideoClick}
                className="w-full h-full object-cover rounded-lg cursor-pointer"
              />
              {!hasAudio && (
                <div
                  className="absolute top-4 left-4 cursor-pointer z-10"
                  onClick={handleAudioClick}
                >
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 hover:bg-black/80 transition-all">
                    <p className="text-white text-sm font-medium">
                      Click for audio
                    </p>
                  </div>
                </div>
              )}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-6">
                    <Play className="w-12 h-12 text-white fill-white" />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground text-sm opacity-60">
              Video placeholder
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={isFirstStep}
            className="min-w-[100px] bg-[#141414] border-border text-muted-foreground hover:bg-[#1a1a1a] hover:text-foreground transition-all"
          >
            Back
          </Button>
          <Button
            onClick={handleNext}
            className={
              isLastStep
                ? "min-w-[100px] bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 text-white border-0 hover:opacity-80 transition-all"
                : "min-w-[100px] bg-[#141414] text-foreground border border-border hover:bg-[#1a1a1a] transition-all"
            }
          >
            {isLastStep ? "Get started" : "Next"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
