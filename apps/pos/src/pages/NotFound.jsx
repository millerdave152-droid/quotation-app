/**
 * TeleTime POS - 404 Not Found Page
 */

import { Link, useNavigate } from 'react-router-dom';
import { HomeIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* 404 Graphic */}
        <div className="mb-8">
          <div className="text-9xl font-bold text-slate-600 mb-2">404</div>
          <div className="w-32 h-1 bg-blue-500 mx-auto rounded-full" />
        </div>

        {/* Message */}
        <h1 className="text-2xl font-bold text-white mb-4">
          Page Not Found
        </h1>
        <p className="text-slate-400 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="
              flex items-center justify-center gap-2
              h-12 px-6
              bg-blue-600 hover:bg-blue-700
              text-white font-medium
              rounded-xl
              transition-colors
            "
          >
            <HomeIcon className="w-5 h-5" />
            Go to POS
          </Link>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="
              flex items-center justify-center gap-2
              h-12 px-6
              bg-slate-700 hover:bg-slate-600
              text-white font-medium
              rounded-xl
              transition-colors
            "
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Go Back
          </button>
        </div>

        {/* Footer */}
        <p className="text-slate-500 text-sm mt-12">
          TeleTime Point of Sale System
        </p>
      </div>
    </div>
  );
}

export default NotFound;
