import cockpit from 'cockpit';
import React, { useState } from 'react';
import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection/index.js";

const _ = cockpit.gettext;

// The raw skopeo/bootc output behind a friendly error message, collapsed by
// default: the one-line summary is what most people need, the exact tool text
// is what a bug report or a registry admin needs.
export const ErrorDetails = ({ details }) => {
    const [expanded, setExpanded] = useState(false);

    if (!details) return null;

    return (
        <ExpandableSection
            className="ct-error-details"
            toggleText={expanded ? _("Hide details") : _("Show details")}
            isExpanded={expanded}
            onToggle={(_event, isExpanded) => setExpanded(isExpanded)}
        >
            <pre className="ct-error-details-text">{details}</pre>
        </ExpandableSection>
    );
};
