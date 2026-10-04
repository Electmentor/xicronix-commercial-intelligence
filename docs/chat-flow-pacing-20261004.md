# Conversation flow and pacing

Founder requested contextual lists only when useful, not on every reply, and 3x slower presentation. Greeting now has no menu. Choices remain in their originating message as compact inline controls, with older controls disabled. Prompt defaults to options=[] and open conversational follow-ups; explicit choice requests still receive buttons. Successful responses remain in typing state until three times the measured request duration, with a three-second minimum. Network and error responses are not artificially delayed. No extra model calls or server wait added.
