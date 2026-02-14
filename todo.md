we should aslo make sure that the docker build layers andw whatever nonsense in overlay2 gets cleaned up as well after each container teardown so that it doesnt bloat the filesystem - IMPORTANT


also seems to me like revisioncontext and issuecontext can use a shared base type. also inspect other rtpyes for possible hierarchy to avoid duplicities - also nwo with the isrevision flag is there even a point for revisioncontext? explain

currently, the orchestrator only support running copilot cli. lets add support for running claude code cli inside this thang as well
